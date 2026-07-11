// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { GitBranchIcon, ListTreeIcon, MessageSquarePlusIcon, PencilIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Composer } from "@/features/composer/composer";
import { parseComposerControl } from "@/features/composer/commands";
import { MarkdownMessage } from "./markdown-message";
import { TranscriptViewport } from "./transcript-viewport";

/** @typedef {{ role: string, text?: string, toolCallId?: string, toolName?: string, status?: string, input?: unknown, output?: unknown }} Message */
/** @typedef {{ threadId: string, sessionFile: string, title?: string, messages: Message[], model?: {provider: string, id: string, name: string} | null, thinkingLevel?: string, thinkingLevels?: string[], commands?: Array<any>, schema?: { fileVersion?: number, runtimeVersion: number, newer: boolean } }} Thread */
/** @typedef {{ threadId?: string, sessionFile: string, title: string, modified?: string, messageCount?: number }} ThreadSummary */

/** @param {{ workspace: { id: string, path: string }, models: Array<{ provider: string, id: string, name: string }>, model: { provider: string, id: string, name?: string } | null, onModelChange: (model: any) => void }} props */
export function ThreadRunner({ workspace, models, model, onModelChange }) {
  const [thread, setThread] = useState(/** @type {Thread | null} */ (null));
  const [threads, setThreads] = useState(/** @type {ThreadSummary[]} */ ([]));
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(/** @type {string | null} */ (null));
  const [runtimePrompt, setRuntimePrompt] = useState(/** @type {any} */ (null));
  const [runtimeValue, setRuntimeValue] = useState("");
  const [newThinking, setNewThinking] = useState("medium");
  const [renameTarget, setRenameTarget] = useState(/** @type {ThreadSummary | null} */ (null));
  const [renameValue, setRenameValue] = useState("");
  const [tree, setTree] = useState(/** @type {Array<any>} */ ([]));
  const [treeOpen, setTreeOpen] = useState(false);
  const revision = useRef(0);
  const draftsRef = useRef(/** @type {Record<string, string>} */ ({}));
  const scrollPositionsRef = useRef(/** @type {Record<string, number>} */ ({}));
  const scrollSaveTimer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
  const [dismissedSkew, setDismissedSkew] = useState(/** @type {string | null} */ (null));
  const threadModel = thread?.model;
  const activeModel = thread
    ? threadModel && models.some((item) => item.provider === threadModel.provider && item.id === threadModel.id) ? threadModel : null
    : model;

  useEffect(() => {
    /** @type {string | undefined} */
    let watchId;
    void invoke("app_state_snapshot").then(async ({ state }) => {
      const legacy = state.windows?.main;
      const saved = legacy?.workspace_views?.[workspace.id] ?? (legacy?.workspace_id === workspace.id ? legacy : null);
      const available = /** @type {ThreadSummary[]} */ (await request("listThreads", { cwd: workspace.path }));
      setThreads(available);
      if (!saved) return;
      revision.current = saved.revision ?? 0;
      draftsRef.current = saved.drafts ?? {};
      scrollPositionsRef.current = saved.scroll_positions ?? {};
      setPrompt(saved.drafts?.[saved.active_thread_id ?? "new"] ?? saved.draft ?? "");
      if (!saved.active_thread_id || !saved.session_file) return;
      const recovered = /** @type {Thread & { runStatus?: string }} */ (await request("recoverThread", {
        cwd: workspace.path, threadId: saved.active_thread_id, sessionFile: saved.session_file,
      }));
      setThread(recovered);
      if (recovered.runStatus === "running") {
        watchId = crypto.randomUUID();
        void request("watchThread", { threadId: recovered.threadId }, (event) => {
          if (event.payload.threadId !== saved.active_thread_id) return;
          if (event.type === "messageDelta") setStream((value) => value + event.payload.delta);
          if (event.type === "toolCall") setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
        }, watchId).catch(() => {});
      }
      if (["interrupted", "missing"].includes(recovered.runStatus ?? "")) setError(recovered.runStatus === "missing" ? "Saved session is missing. Start a new thread." : "The previous run was interrupted. You can continue this thread.");
    }).catch((cause) => setError(String(cause)));
    return () => { if (watchId) void request("cancel", { requestId: watchId }).catch(() => {}); };
  }, [workspace.id, workspace.path]);

  useEffect(() => {
    if (!thread || running) return;
    const refresh = () => void request("refreshThread", {
      cwd: workspace.path, threadId: thread.threadId, sessionFile: thread.sessionFile,
    }).then((value) => setThread(/** @type {Thread} */ (value))).catch((cause) => setError(String(cause)));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [thread, running, workspace.path]);

  /** @param {string} operation @param {Record<string, unknown>} payload @param {(event: any) => void} [onEvent] @param {string} [requestId] */
  const request = (operation, payload, onEvent = (_event) => {}, requestId = crypto.randomUUID()) => new Promise((resolve, reject) => {
    void listen("agent-host-event", ({ payload: event }) => {
      if (event.requestId !== requestId) return;
      if (["messageDelta", "toolCall", "runtimePrompt", "runtimeNotice", "editorText"].includes(event.type)) onEvent(event);
      if (!["completed", "failed", "cancelled"].includes(event.type)) return;
      stop();
      if (event.type === "completed") resolve(event.payload);
      else reject(new Error(event.payload.message ?? event.type));
    }).then((unlisten) => {
      stop = unlisten;
      return invoke("send_agent_request", { request: { version: 1, requestId, operation, payload } });
    }).catch((cause) => { stop(); reject(cause); });
    let stop = () => {};
  });

  async function submit() {
    if (!prompt.trim() || running) return;
    const control = parseComposerControl(prompt);
    if (control?.type === "thinking") { await applyThinking(control.value); setPrompt(""); return; }
    if (control?.type === "model") {
      const selected = models.find((item) => item.provider === control.provider && item.id === control.id);
      if (!selected) { setError("That model is unavailable. Choose an available model."); return; }
      await applyModel(selected); setPrompt(""); return;
    }
    if (!activeModel) { setError("Choose an available model to continue."); return; }
    setRunning(true);
    setError("");
    setStream("");
    try {
      const active = thread ?? /** @type {Thread} */ (await request("createThread", {
        cwd: workspace.path,
        provider: activeModel.provider,
        modelId: activeModel.id,
        thinkingLevel: newThinking,
      }));
      const text = prompt;
      setPrompt("");
      setThread({ ...active, messages: [...active.messages, { role: "user", text }] });
      if (!thread) {
        setThreads((items) => [{ threadId: active.threadId, sessionFile: active.sessionFile, title: "New thread", messageCount: 1 }, ...items]);
        void request("generateThreadTitle", { threadId: active.threadId, prompt: text }).then((result) => {
          if (!result.title) return;
          setThreads((items) => items.map((item) => item.threadId === active.threadId ? { ...item, title: result.title } : item));
          setThread((value) => value?.threadId === active.threadId ? { ...value, title: result.title } : value);
        }).catch(() => {});
      }
      void saveProjection(active, "running", "");
      const activeRunId = crypto.randomUUID();
      setRunId(activeRunId);
      const completed = /** @type {Thread} */ (await request("promptThread", { threadId: active.threadId, prompt: text }, (event) => {
        if (event.type === "messageDelta") setStream((value) => value + event.payload.delta);
        if (event.type === "toolCall") setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
        if (event.type === "editorText" && event.payload.threadId === active.threadId) {
          setPrompt((value) => {
            const next = event.payload.mode === "append" ? value + event.payload.text : event.payload.text;
            void saveProjection(active, "running", next);
            return next;
          });
        }
        if (event.type === "runtimePrompt") { setRuntimeValue(event.payload.options?.[0] ?? ""); setRuntimePrompt(event.payload); }
        if (event.type === "runtimeNotice" && event.payload.type === "error") setError(event.payload.message);
      }, activeRunId));
      setThread(completed);
      void saveProjection(completed, "idle", "");
      setStream("");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setRunning(false);
      setRunId(null);
    }
  }

  /** @param {{provider: string, id: string, name?: string}} nextModel */
  async function applyModel(nextModel) {
    setError("");
    onModelChange(nextModel);
    if (!thread) return;
    try { setThread(/** @type {Thread} */ (await request("setThreadModel", { threadId: thread.threadId, provider: nextModel.provider, modelId: nextModel.id }))); }
    catch (cause) { setError(String(cause)); }
  }

  /** @param {string} level */
  async function applyThinking(level) {
    setError("");
    if (!thread) { setNewThinking(level); return; }
    try { setThread(/** @type {Thread} */ (await request("setThreadThinking", { threadId: thread.threadId, thinkingLevel: level }))); }
    catch (cause) { setError(String(cause)); }
  }

  function saveProjection(active = thread, status = running ? "running" : "idle", draft = prompt) {
    const key = active?.threadId ?? "new";
    const nextDrafts = { ...draftsRef.current, [key]: draft };
    draftsRef.current = nextDrafts;
    const nextRevision = ++revision.current;
    return invoke("set_workspace_projection", { workspaceId: workspace.id, projection: {
      active_thread_id: active?.threadId ?? null, session_file: active?.sessionFile ?? null,
      draft, drafts: nextDrafts, run_status: status, revision: nextRevision,
      scroll_positions: scrollPositionsRef.current,
    } });
  }

  /** @param {ThreadSummary} item */
  async function selectThread(item) {
    if (item.threadId === thread?.threadId) return;
    await saveProjection();
    setError(""); setStream("");
    try {
      const opened = /** @type {Thread} */ (await request("openThread", { cwd: workspace.path, sessionFile: item.sessionFile }));
      setThread(opened);
      setPrompt(draftsRef.current[opened.threadId] ?? "");
      await saveProjection(opened, "idle", draftsRef.current[opened.threadId] ?? "");
    } catch (cause) { setError(String(cause)); }
  }

  async function newThread() {
    await saveProjection();
    setThread(null); setStream(""); setError(""); setPrompt(draftsRef.current.new ?? "");
  }

  function stopRun() {
    if (runId) void request("cancel", { requestId: runId }).catch((cause) => setError(String(cause)));
  }

  function resolvePrompt(cancelled = false) {
    if (!runtimePrompt) return;
    void request("resolveRuntimePrompt", { promptId: runtimePrompt.promptId, threadId: runtimePrompt.threadId, value: runtimePrompt.kind === "confirm" ? true : runtimeValue, cancelled });
    setRuntimePrompt(null);
  }

  async function renameActiveThread() {
    if (!renameTarget?.threadId || !renameValue.trim()) return;
    try {
      const result = await request("renameThread", { threadId: renameTarget.threadId, title: renameValue });
      setThreads((items) => items.map((item) => item.threadId === renameTarget.threadId ? { ...item, title: result.title } : item));
      setThread((value) => value && value.threadId === renameTarget.threadId ? { ...value, title: result.title } : value);
      setRenameTarget(null);
    } catch (cause) { setError(String(cause)); }
  }

  async function openTree() {
    if (!thread) return;
    try { const result = await request("getThreadTree", { threadId: thread.threadId }); setTree(result.nodes); setTreeOpen(true); }
    catch (cause) { setError(String(cause)); }
  }

  /** @param {string} entryId */
  async function forkAt(entryId) {
    if (!thread) return;
    try {
      const forked = /** @type {Thread} */ (await request("forkThread", { threadId: thread.threadId, entryId, cwd: workspace.path }));
      setThread(forked); setTreeOpen(false); setStream("");
      setThreads(/** @type {ThreadSummary[]} */ (await request("listThreads", { cwd: workspace.path })));
      await saveProjection(forked, "idle", draftsRef.current[forked.threadId] ?? "");
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {string} entryId @param {boolean} summarize */
  async function navigateTo(entryId, summarize) {
    if (!thread) return;
    try {
      const result = /** @type {Thread & {editorText?: string}} */ (await request("navigateThread", { threadId: thread.threadId, entryId, summarize }));
      setThread(result); setTreeOpen(false); setStream("");
      if (result.editorText != null) setPrompt(result.editorText);
      await saveProjection(result, "idle", result.editorText ?? prompt);
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {number} top */
  function rememberScroll(top) {
    const key = thread?.threadId ?? "new";
    scrollPositionsRef.current[key] = top;
    clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => void saveProjection(), 250);
  }

  return (
    <section className="grid gap-3 border-t pt-4 md:grid-cols-[10rem_1fr]" aria-label="Thread">
      <nav className="space-y-1" aria-label="Threads">
        <Button className="w-full justify-start" size="sm" variant={!thread ? "secondary" : "ghost"} onClick={() => void newThread()}><MessageSquarePlusIcon />New thread</Button>
        {threads.map((item) => <div className="flex" key={item.sessionFile}>
          <Button className="min-w-0 flex-1 justify-start truncate" size="sm" variant={item.threadId === thread?.threadId || item.sessionFile === thread?.sessionFile ? "secondary" : "ghost"} onClick={() => void selectThread(item)}>{item.title}</Button>
          <Button aria-label={`Rename ${item.title}`} size="icon-sm" variant="ghost" onClick={() => { setRenameTarget(item); setRenameValue(item.title); }}><PencilIcon /></Button>
        </div>)}
        {threads.length === 0 && <p className="px-2 text-xs text-muted-foreground">No threads yet.</p>}
      </nav>
      <div className="min-w-0 space-y-3">
      {thread && <div className="flex justify-end"><Button size="sm" variant="outline" disabled={running} onClick={() => void openTree()}><ListTreeIcon />Tree</Button></div>}
      {thread?.schema?.newer && dismissedSkew !== thread.sessionFile && <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
        <span>This session was written by Pi schema {thread.schema.fileVersion}; this app supports {thread.schema.runtimeVersion}. It is read-only.</span>
        <Button type="button" variant="ghost" onClick={() => setDismissedSkew(thread.sessionFile)}>Dismiss</Button>
      </div>}
      <TranscriptViewport
        threadKey={thread?.threadId ?? "new"}
        savedTop={scrollPositionsRef.current[thread?.threadId ?? "new"]}
        contentKey={`${thread?.messages.length ?? 0}:${stream.length}`}
        onPosition={rememberScroll}
      >
        {!thread && <p className="text-sm text-muted-foreground">Start a new thread in this workspace.</p>}
        {thread?.messages.map((message, index) => message.role === "tool" ? <ToolRow key={message.toolCallId ?? index} tool={message} /> : (
          message.role === "user"
            ? <p key={`${message.role}-${index}`} className="ml-8 break-words rounded-md bg-muted p-2 text-sm">{message.text}</p>
            : <MarkdownMessage key={`${message.role}-${index}`} className="mr-8 p-2">{message.text ?? ""}</MarkdownMessage>
        ))}
        {stream && <MarkdownMessage className="mr-8 p-2" data-testid="streaming-response">{stream}</MarkdownMessage>}
      </TranscriptViewport>
      <Composer
        value={prompt} running={running} disabled={Boolean(thread?.schema?.newer)}
        commands={thread?.commands} models={models} model={activeModel}
        thinkingLevel={thread?.thinkingLevel ?? newThinking} thinkingLevels={thread?.thinkingLevels}
        onChange={(value) => { setPrompt(value); void saveProjection(thread, running ? "running" : "idle", value); }}
        onSend={() => void submit()} onStop={stopRun}
        onModelChange={(next) => void applyModel(next)} onThinkingChange={(level) => void applyThinking(level)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Dialog open={Boolean(runtimePrompt)} onOpenChange={(/** @type {boolean} */ open) => { if (!open) resolvePrompt(true); }}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>{runtimePrompt?.title}</DialogTitle><DialogDescription className={undefined}>{runtimePrompt?.message}</DialogDescription></DialogHeader>
          {runtimePrompt?.kind === "select" ? <select className="h-9 rounded-md border bg-background px-3" value={runtimeValue} onChange={(/** @type {React.ChangeEvent<HTMLSelectElement>} */ event) => setRuntimeValue(event.target.value)}>{runtimePrompt.options?.map((/** @type {string} */ option) => <option key={option}>{option}</option>)}</select> : runtimePrompt?.kind !== "confirm" && <Input aria-label="Runtime input" className={undefined} type="text" value={runtimeValue} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setRuntimeValue(event.target.value)} />}
          <DialogFooter className={undefined}><Button variant="outline" onClick={() => resolvePrompt(true)}>Cancel</Button><Button onClick={() => resolvePrompt(false)}>Continue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(renameTarget)} onOpenChange={(/** @type {boolean} */ open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Rename thread</DialogTitle><DialogDescription className={undefined}>This name is saved in the Pi session.</DialogDescription></DialogHeader>
          <Input aria-label="Thread name" className={undefined} type="text" value={renameValue} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setRenameValue(event.target.value)} />
          <DialogFooter className={undefined}><Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button><Button disabled={!renameValue.trim()} onClick={() => void renameActiveThread()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={treeOpen} onOpenChange={setTreeOpen}>
        <DialogContent className="max-h-[80vh] overflow-auto">
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Session tree</DialogTitle><DialogDescription className={undefined}>Navigate within this Pi session or fork a new session.</DialogDescription></DialogHeader>
          <TreeNodes nodes={tree} onFork={forkAt} onNavigate={navigateTo} />
        </DialogContent>
      </Dialog>
      </div>
    </section>
  );
}

/** @param {{nodes: Array<any>, onFork: (id: string) => Promise<void>, onNavigate: (id: string, summarize: boolean) => Promise<void>, depth?: number}} props */
function TreeNodes({ nodes, onFork, onNavigate, depth = 0 }) {
  return <div className="space-y-1">{nodes.map((node) => <div key={node.entryId}>
    <div className="flex items-center gap-1 rounded-md border p-2" style={{ marginLeft: `${Math.min(depth, 6) * 12}px` }}>
      <Button className="min-w-0 flex-1 justify-start" size="sm" variant={node.active ? "secondary" : "ghost"} onClick={() => void onNavigate(node.entryId, false)}>
        <span className="truncate">{node.role ?? node.type}: {node.preview || "Empty"}</span>
      </Button>
      <Button aria-label="Navigate and summarize abandoned branch" size="sm" variant="outline" onClick={() => void onNavigate(node.entryId, true)}>Summarize</Button>
      {node.role === "assistant" && <Button aria-label="Fork from response" size="icon-sm" variant="ghost" onClick={() => void onFork(node.entryId)}><GitBranchIcon /></Button>}
    </div>
    {node.children?.length > 0 && <TreeNodes nodes={node.children} onFork={onFork} onNavigate={onNavigate} depth={depth + 1} />}
  </div>)}</div>;
}

/** @param {Message[]} messages @param {Message} tool */
function reconcileTool(messages, tool) {
  const index = messages.findIndex((message) => message.role === "tool" && message.toolCallId === tool.toolCallId);
  if (index < 0) return [...messages, { ...tool, role: "tool" }];
  return messages.map((message, position) => position === index ? { ...message, ...tool } : message);
}

/** @param {unknown} value */
function preview(value) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
}

/** @param {{ tool: Message }} props */
function ToolRow({ tool }) {
  const content = preview(tool.output ?? tool.input);
  return <details className="rounded-md border bg-card px-3 py-2 text-sm" data-testid="tool-call">
    <summary className="cursor-pointer font-medium">{tool.toolName ?? "Tool"} · {tool.status}</summary>
    {content && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{content}</pre>}
  </details>;
}
