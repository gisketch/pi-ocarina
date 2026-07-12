import { getCurrentWindow } from "@tauri-apps/api/window";
import { requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { ArchiveIcon, ArrowDownIcon, ArrowUpIcon, FileDiffIcon, GitBranchIcon, ListTreeIcon, MessageSquarePlusIcon, PencilIcon, PinIcon, RefreshCwIcon, RotateCcwIcon } from "@/shared/ui/icon";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Composer } from "@/features/composer/composer";
import { ChangesPanel } from "@/features/review/changes-panel";
import { parseComposerControl } from "@/features/composer/commands";
import { importAttachments, type Attachment } from "@/features/composer/attachments";
import { ExtensionDock } from "@/features/extensions/extension-dock-panel";
import { EMPTY_DOCK, reduceDock, type DockState } from "@/features/extensions/extension-dock.js";
import { blockedCommand, loadCompatibility, saveCompatibility, type CompatibilityRecords } from "@/features/extensions/compatibility.js";
import { notificationCategories, shouldNotify, shouldRequestPermission } from "@/features/notifications/notification-policy.js";
import { Textarea } from "@/shared/ui/textarea";
import { MatrixSpinner } from "@/shared/ui/cell-matrix";
import { MarkdownMessage } from "./markdown-message";
import { ChatBubble, ToolCall } from "./chat-message";
import { TranscriptViewport } from "./transcript-viewport";
import { movePinned, organizeThreads, togglePinned } from "./thread-organization";
import { createCoalescedTask } from "./coalesced-task";
import { requestAgent } from "@/shared/lib/agent-client";
import type { RuntimePromptPayload, ToolCallPayload } from "@/shared/contracts/agent";
import type { Model, QueueItem, Thread, ThreadMessage as Message, ThreadMetadata, ThreadSummary, ThreadTreeNode, Workspace } from "@/shared/contracts/app";

export function ThreadRunner({ workspace, models, model, onModelChange, sidebarVisible = true, sidebarHeader }: { workspace: Workspace; models: Model[]; model: Model | null; onModelChange: (model: Model | null) => void; sidebarVisible?: boolean; sidebarHeader?: ReactNode }) {
  const windowLabel = getCurrentWindow().label;
  const [thread, setThread] = useState<Thread | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");
  const [runningThreads, setRunningThreads] = useState(new Set<string>());
  const [attentionThreads, setAttentionThreads] = useState(new Set<string>());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [runtimePrompt, setRuntimePrompt] = useState<RuntimePromptPayload | null>(null);
  const [runtimeValue, setRuntimeValue] = useState("");
  const [notice, setNotice] = useState("");
  const compatibilityRef = useRef<CompatibilityRecords>(loadCompatibility(workspace.id));
  const [newThinking, setNewThinking] = useState("medium");
  const [renameTarget, setRenameTarget] = useState<ThreadSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tree, setTree] = useState<ThreadTreeNode[]>([]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [query] = useState("");
  const [threadMetadata, setThreadMetadata] = useState<ThreadMetadata>({});
  const revision = useRef(0);
  const selectedThreadRef = useRef<string | null>(null);
  const runIdsRef = useRef(new Map<string, string>());
  const streamsRef = useRef(new Map<string, string>());
  const runtimePromptsRef = useRef(new Map<string, RuntimePromptPayload>());
  const docksRef = useRef(new Map<string, DockState>());
  const [dock, setDock] = useState<DockState>({ ...EMPTY_DOCK });
  const draftsRef = useRef<Record<string, string>>({});
  const draftAttachmentsRef = useRef<Record<string, Attachment[]>>({});
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftPersistence = useRef<ReturnType<typeof createCoalescedTask<() => Promise<void>>> | null>(null);
  if (!draftPersistence.current) draftPersistence.current = createCoalescedTask((write) => write(), 300);
  const threadMetadataRef = useRef<ThreadMetadata>({});
  const [dismissedSkew, setDismissedSkew] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changePath, setChangePath] = useState("");
  const [resourcesOpen, setResourcesOpen] = useState(false);
  useEffect(() => {
    const openChanges = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "g") { event.preventDefault(); setChangesOpen(true); } };
    window.addEventListener("keydown", openChanges);
    return () => window.removeEventListener("keydown", openChanges);
  }, []);
  const threadModel = thread?.model;
  const running = thread ? runningThreads.has(thread.threadId) : false;
  const activeModel = thread
    ? threadModel && models.some((item) => item.provider === threadModel.provider && item.id === threadModel.id) ? threadModel : null
    : model;

  useEffect(() => {
    const backgrounded = () => {
      if (runningThreads.size === 0) return;
      const permission = Notification.permission;
      if (shouldRequestPermission({ backgrounded: true, running: true, categories: notificationCategories(), permission })) void requestPermission();
    };
    addEventListener("blur", backgrounded); document.addEventListener("visibilitychange", backgrounded);
    return () => { removeEventListener("blur", backgrounded); document.removeEventListener("visibilitychange", backgrounded); };
  }, [runningThreads]);

  useEffect(() => {
    const clearSelected = () => selectedThreadRef.current && setAttentionThreads((items) => { const next = new Set(items); next.delete(selectedThreadRef.current ?? ""); return next; });
    addEventListener("focus", clearSelected); return () => removeEventListener("focus", clearSelected);
  }, []);

  /** @param {string} threadId @param {"completed" | "failed" | "attention"} category @param {string} title */
  function signalAttention(threadId: string, category: "completed" | "failed" | "attention", title: string) {
    const selected = selectedThreadRef.current === threadId;
    const focused = document.hasFocus();
    if (focused && selected) return;
    setAttentionThreads((items) => new Set(items).add(threadId));
    const categories = notificationCategories();
    if (!shouldNotify({ focused, selected, category, categories })) return;
    if (Notification.permission === "granted") sendNotification({ title, body: `Thread ${category}` });
  }

  useEffect(() => {
    /** @type {string | undefined} */
    let watchId: string | undefined;
    void invokeTauri("app_state_snapshot").then(async ({ state }) => {
      const legacy = state.windows?.[windowLabel];
      const saved = legacy?.workspace_views?.[workspace.id] ?? (legacy?.workspace_id === workspace.id ? legacy : null);
      const available = await requestAgent("listThreads", { cwd: workspace.path });
      setThreads(available);
      if (!saved) return;
      revision.current = saved.revision ?? 0;
      draftsRef.current = saved.drafts ?? {};
      draftAttachmentsRef.current = saved.draft_attachments ?? (saved.attachments ? { [saved.active_thread_id ?? "new"]: saved.attachments } : {});
      scrollPositionsRef.current = saved.scroll_positions ?? {};
      threadMetadataRef.current = saved.thread_metadata ?? {};
      setThreadMetadata(threadMetadataRef.current);
      setPrompt(saved.drafts?.[saved.active_thread_id ?? "new"] ?? saved.draft ?? "");
      setAttachments(draftAttachmentsRef.current[saved.active_thread_id ?? "new"] ?? []);
      if (!saved.active_thread_id || !saved.session_file) return;
      const recovered = await requestAgent("recoverThread", {
        cwd: workspace.path, threadId: saved.active_thread_id, sessionFile: saved.session_file,
      });
      setThread(recovered);
      selectedThreadRef.current = recovered.threadId;
      if (recovered.runStatus === "running") {
        setRunningThreads((items) => new Set(items).add(recovered.threadId));
        void requestAgent("threadQueue", { threadId: recovered.threadId }).then((result) => setQueue(result.items)).catch(() => {});
        watchId = crypto.randomUUID();
        void requestAgent("watchThread", { threadId: recovered.threadId }, (event) => {
          if (event.payload.threadId !== saved.active_thread_id) return;
          if (event.type === "messageDelta") appendStream(recovered.threadId, event.payload.delta);
          if (event.type === "toolCall") setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
        }, watchId).catch(() => {});
      }
      if (["interrupted", "missing"].includes(recovered.runStatus ?? "")) setError(recovered.runStatus === "missing" ? "Saved session is missing. Start a new thread." : "The previous run was interrupted. You can continue this thread.");
    }).catch((cause) => setError(String(cause)));
    return () => { if (watchId) void requestAgent("cancel", { requestId: watchId }).catch(() => {}); };
  }, [windowLabel, workspace.id, workspace.path]);

  useEffect(() => {
    let stop = () => {};
    void listenTauri("app-state://changed", ({ payload: state }) => {
      const saved = state.windows?.[windowLabel]?.workspace_views?.[workspace.id];
      const threadId = selectedThreadRef.current;
      if (!threadId || saved?.active_thread_id !== threadId) return;
      const draft = saved.drafts?.[threadId] ?? saved.draft ?? "";
      setPrompt((current) => current === draft ? current : draft);
    }).then((unlisten) => { stop = unlisten; });
    return () => stop();
  }, [windowLabel, workspace.id]);

  useEffect(() => {
    let stop = () => {};
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (runtimePromptsRef.current.size === 0 && !draftPersistence.current?.pending()) return;
      event.preventDefault();
      await draftPersistence.current?.flush();
      await Promise.all([...runtimePromptsRef.current.values()].map((item) => requestAgent("resolveRuntimePrompt", {
        promptId: item.promptId, threadId: item.threadId, cancelled: true,
      }).catch(() => {})));
      await getCurrentWindow().destroy();
    }).then((unlisten) => { stop = unlisten; });
    return () => stop();
  }, []);

  useEffect(() => {
    if (!thread || running) return;
    const refresh = () => {
      void requestAgent("refreshThread", {
        cwd: workspace.path, threadId: thread.threadId, sessionFile: thread.sessionFile,
      }).then(setThread).catch((cause) => setError(String(cause)));
      void requestAgent("listThreads", { cwd: workspace.path }).then(setThreads).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [thread, running, workspace.path]);

  async function submit() {
    if ((!prompt.trim() && !attachments.length)) return;
    await flushDraftSave();
    const blocked = blockedCommand(prompt, thread?.commands, compatibilityRef.current);
    if (blocked) { setError(blocked.message); return; }
    if (running) { await enqueue("followUp"); return; }
    const control = parseComposerControl(prompt);
    if (control?.type === "thinking") { await applyThinking(control.value); setPrompt(""); void saveProjection(thread, "idle", ""); return; }
    if (control?.type === "model") {
      const selected = models.find((item) => item.provider === control.provider && item.id === control.id);
      if (!selected) { setError("That model is unavailable. Choose an available model."); return; }
      await applyModel(selected); setPrompt(""); void saveProjection(thread, "idle", ""); return;
    }
    if (!activeModel) { setError("Choose an available model to continue."); return; }
    setError("");
    setStream("");
    /** @type {string | null} */
    let startedThreadId: string | null = null;
    /** @type {string | null} */
    let activeRunId: string | null = null;
    try {
      const active = thread ?? await requestAgent("createThread", {
        cwd: workspace.path,
        provider: activeModel.provider,
        modelId: activeModel.id,
        thinkingLevel: newThinking,
      });
      const text = prompt;
      const submittedAttachments = attachments;
      startedThreadId = active.threadId;
      selectedThreadRef.current = active.threadId;
      setPrompt("");
      setThread({ ...active, messages: [...active.messages, { role: "user", text: text || submittedAttachments.map((item) => item.name).join(", ") }] });
      if (!thread) {
        setThreads((items) => [{ threadId: active.threadId, sessionFile: active.sessionFile, title: "New thread", messageCount: 1 }, ...items]);
        void requestAgent("generateThreadTitle", { threadId: active.threadId, prompt: text }).then((result) => {
          if (!result.title) return;
          const title = result.title;
          setThreads((items) => items.map((item) => item.threadId === active.threadId ? { ...item, title } : item));
          setThread((value) => value?.threadId === active.threadId ? { ...value, title } : value);
        }).catch(() => {});
      }
      void saveProjection(active, "running", "");
      activeRunId = crypto.randomUUID();
      runIdsRef.current.set(active.threadId, activeRunId);
      setRunningThreads((items) => new Set(items).add(active.threadId));
      const completed = await requestAgent("promptThread", { threadId: active.threadId, prompt: text, attachments: submittedAttachments }, (event) => {
        if (event.type === "messageDelta") appendStream(active.threadId, event.payload.delta);
        if (event.type === "toolCall" && selectedThreadRef.current === active.threadId) setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
        if (event.type === "editorText" && event.payload.threadId === active.threadId) {
          setPrompt((value) => {
            const next = event.payload.mode === "append" ? value + event.payload.text : event.payload.text;
            void saveProjection(active, "running", next);
            return next;
          });
        }
        if (event.type === "runtimePrompt") { runtimePromptsRef.current.set(active.threadId, event.payload); signalAttention(active.threadId, "attention", active.title ?? "Pi Ocarina"); if (selectedThreadRef.current === active.threadId) { setRuntimeValue(event.payload.options?.[0] ?? ""); setRuntimePrompt(event.payload); } }
        if (event.type === "runtimeNotice" && selectedThreadRef.current === active.threadId) {
          if (event.payload.type === "error") setError(event.payload.message);
          else setNotice(event.payload.message);
        }
        if (event.type === "compatibilityIssue") {
          const key = `${event.payload.extensionPath}::${event.payload.commandName}`;
          compatibilityRef.current = { ...compatibilityRef.current, [key]: event.payload };
          saveCompatibility(workspace.id, compatibilityRef.current);
        }
        if (event.type === "sessionChanged") {
          selectedThreadRef.current = event.payload.threadId;
          setThread(event.payload);
          setThreads((items) => [{ threadId: event.payload.threadId, sessionFile: event.payload.sessionFile, title: event.payload.title ?? "New thread" }, ...items.filter((item) => item.threadId !== event.payload.threadId)]);
          setPrompt(draftsRef.current[event.payload.threadId] ?? "");
        }
        if (event.type === "extensionDock") {
          const next = reduceDock(docksRef.current.get(active.threadId), event.payload);
          docksRef.current.set(active.threadId, next);
          if (selectedThreadRef.current === active.threadId) setDock(next);
        }
      }, activeRunId);
      if (selectedThreadRef.current === active.threadId) setThread(completed);
      signalAttention(active.threadId, "completed", completed.title ?? "Pi Ocarina");
      draftAttachmentsRef.current[active.threadId] = [];
      const refreshed = await requestAgent("listThreads", { cwd: workspace.path });
      setThreads(refreshed);
      const summary = refreshed.find((item) => item.threadId === completed.threadId || item.sessionFile === completed.sessionFile);
      if (selectedThreadRef.current === active.threadId) {
        setAttachments([]);
        if (summary) markRead(summary);
        void saveProjection(completed, "idle", "", []);
      }
      streamsRef.current.delete(active.threadId);
      if (selectedThreadRef.current === active.threadId) setStream("");
    } catch (cause) {
      if (startedThreadId) signalAttention(startedThreadId, "failed", thread?.title ?? "Pi Ocarina");
      if (!startedThreadId || selectedThreadRef.current === startedThreadId) setError(String(cause));
    } finally {
      const completedThreadId = activeRunId ? [...runIdsRef.current].find(([, id]) => id === activeRunId)?.[0] : undefined;
      if (completedThreadId) {
        runIdsRef.current.delete(completedThreadId);
        setRunningThreads((items) => { const next = new Set(items); next.delete(completedThreadId); return next; });
        if (selectedThreadRef.current === completedThreadId) setQueue([]);
      }
    }
  }

  /** @param {string} threadId @param {string} delta */
  function appendStream(threadId: string, delta: string) {
    const next = (streamsRef.current.get(threadId) ?? "") + delta;
    streamsRef.current.set(threadId, next);
    if (selectedThreadRef.current === threadId) setStream(next);
  }

  /** @param {"steer" | "followUp"} mode */
  async function enqueue(mode: "steer" | "followUp") {
    if (!thread || (!prompt.trim() && !attachments.length)) return;
    try {
      const result = await requestAgent("queueThread", { threadId: thread.threadId, prompt, attachments, mode });
      setQueue(result.items); setPrompt(""); setAttachments([]);
      void saveProjection(thread, "running", "", []);
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {{provider: string, id: string, name?: string}} nextModel */
  async function applyModel(nextModel: Model) {
    setError("");
    onModelChange(nextModel);
    if (!thread) return;
    try { setThread(await requestAgent("setThreadModel", { threadId: thread.threadId, provider: nextModel.provider, modelId: nextModel.id })); }
    catch (cause) { setError(String(cause)); }
  }

  /** @param {string} level */
  async function applyThinking(level: string) {
    setError("");
    if (!thread) { setNewThinking(level); return; }
    try { setThread(await requestAgent("setThreadThinking", { threadId: thread.threadId, thinkingLevel: level })); }
    catch (cause) { setError(String(cause)); }
  }

  async function reloadResources() {
    if (!thread) return;
    try {
      setDock(EMPTY_DOCK); docksRef.current.delete(thread.threadId);
      setThread(await requestAgent("reloadResources", { threadId: thread.threadId }));
      compatibilityRef.current = {}; saveCompatibility(workspace.id, {});
    }
    catch (cause) { setError(String(cause)); }
  }

  function saveProjection(active: Thread | null = thread, status = running ? "running" : "idle", draft = prompt, draftAttachment: Attachment[] = attachments) {
    const key = active?.threadId ?? "new";
    const nextDrafts = { ...draftsRef.current, [key]: draft };
    draftsRef.current = nextDrafts;
    const nextAttachments = { ...draftAttachmentsRef.current, [key]: draftAttachment };
    draftAttachmentsRef.current = nextAttachments;
    const nextRevision = ++revision.current;
    return invokeTauri("set_workspace_projection", { workspaceId: workspace.id, projection: {
      active_thread_id: active?.threadId ?? null, session_file: active?.sessionFile ?? null,
      draft, drafts: nextDrafts, run_status: status, revision: nextRevision,
      draft_attachments: nextAttachments,
      scroll_positions: scrollPositionsRef.current,
      thread_metadata: threadMetadataRef.current,
    } });
  }

  /** @param {string} value */
  function scheduleDraftSave(value: string) {
    const active = thread;
    const status = running ? "running" : "idle";
    const draftAttachment = attachments;
    const key = active?.threadId ?? "new";
    draftsRef.current = { ...draftsRef.current, [key]: value };
    draftPersistence.current?.schedule(() => saveProjection(active, status, value, draftAttachment).catch((cause) => setError(String(cause))));
  }

  const flushDraftSave = () => draftPersistence.current?.flush() ?? Promise.resolve();

  /** @param {ThreadSummary} item */
  async function selectThread(item: ThreadSummary) {
    if (item.threadId === thread?.threadId) return;
    await flushDraftSave();
    setError(""); setStream("");
    try {
      const opened = await requestAgent("openThread", { cwd: workspace.path, sessionFile: item.sessionFile });
      setThread(opened);
      selectedThreadRef.current = opened.threadId;
      setAttentionThreads((items) => { const next = new Set(items); next.delete(opened.threadId); return next; });
      setStream(streamsRef.current.get(opened.threadId) ?? "");
      const pendingPrompt = runtimePromptsRef.current.get(opened.threadId) ?? null;
      setRuntimePrompt(pendingPrompt);
      setRuntimeValue(pendingPrompt?.options?.[0] ?? "");
      setDock(docksRef.current.get(opened.threadId) ?? EMPTY_DOCK);
      setQueue((await requestAgent("threadQueue", { threadId: opened.threadId })).items);
      markRead(item);
      setPrompt(draftsRef.current[opened.threadId] ?? "");
      setAttachments(draftAttachmentsRef.current[opened.threadId] ?? []);
      await saveProjection(opened, "idle", draftsRef.current[opened.threadId] ?? "");
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {ThreadSummary} item */
  function markRead(item: ThreadSummary) {
    const next = { ...threadMetadataRef.current, [item.sessionFile]: { ...threadMetadataRef.current[item.sessionFile], read_message_count: item.messageCount ?? 0 } };
    setOrganization(next);
  }

  function setOrganization(next: ThreadMetadata) {
    threadMetadataRef.current = next;
    setThreadMetadata(next);
    void saveProjection();
  }

  /** @param {ThreadSummary} item */
  function toggleArchive(item: ThreadSummary) {
    setOrganization({ ...threadMetadataRef.current, [item.sessionFile]: { ...threadMetadataRef.current[item.sessionFile], archived: !threadMetadataRef.current[item.sessionFile]?.archived } });
  }

  async function newThread() {
    await flushDraftSave();
    selectedThreadRef.current = null; setThread(null); setStream(""); setDock(EMPTY_DOCK); setError(""); setQueue([]); setPrompt(draftsRef.current.new ?? ""); setAttachments(draftAttachmentsRef.current.new ?? []);
  }

  function stopRun() {
    const id = thread && runIdsRef.current.get(thread.threadId);
    if (id) void requestAgent("cancel", { requestId: id }).catch((cause) => setError(String(cause)));
  }

  function resolvePrompt(cancelled = false) {
    if (!runtimePrompt) return;
    void requestAgent("resolveRuntimePrompt", { promptId: runtimePrompt.promptId, threadId: runtimePrompt.threadId, value: runtimePrompt.kind === "confirm" ? true : runtimeValue, cancelled });
    runtimePromptsRef.current.delete(runtimePrompt.threadId);
    setRuntimePrompt(null);
  }

  async function renameActiveThread() {
    if (!renameTarget?.threadId || !renameValue.trim()) return;
    try {
      const result = await requestAgent("renameThread", { threadId: renameTarget.threadId, title: renameValue });
      setThreads((items) => items.map((item) => item.threadId === renameTarget.threadId ? { ...item, title: result.title } : item));
      setThread((value) => value && value.threadId === renameTarget.threadId ? { ...value, title: result.title } : value);
      setRenameTarget(null);
    } catch (cause) { setError(String(cause)); }
  }

  async function openTree() {
    if (!thread) return;
    try { const result = await requestAgent("getThreadTree", { threadId: thread.threadId }); setTree(result.nodes); setTreeOpen(true); }
    catch (cause) { setError(String(cause)); }
  }

  /** @param {string} entryId */
  async function forkAt(entryId: string) {
    if (!thread) return;
    try {
      const forked = await requestAgent("forkThread", { threadId: thread.threadId, entryId, cwd: workspace.path });
      setThread(forked); setTreeOpen(false); setStream("");
      setThreads(await requestAgent("listThreads", { cwd: workspace.path }));
      await saveProjection(forked, "idle", draftsRef.current[forked.threadId] ?? "");
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {string} entryId @param {boolean} summarize */
  async function navigateTo(entryId: string, summarize: boolean) {
    if (!thread) return;
    try {
      const result = await requestAgent("navigateThread", { threadId: thread.threadId, entryId, summarize });
      setThread(result); setTreeOpen(false); setStream("");
      if (result.editorText != null) setPrompt(result.editorText);
      await saveProjection(result, "idle", result.editorText ?? prompt);
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {number} top */
  function rememberScroll(top: number) {
    const key = thread?.threadId ?? "new";
    scrollPositionsRef.current[key] = top;
    clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => void saveProjection(), 250);
  }

  const organized = useMemo(() => organizeThreads(threads, threadMetadata, query), [threads, threadMetadata, query]);
  const messages = thread?.messages;
  const transcriptItems = useMemo(() => messages?.map((message, index) => message.role === "tool"
    ? <ToolCall key={message.toolCallId ?? index} tool={message} onOpenFile={(path) => { setChangePath(path); setChangesOpen(true); }} />
    : message.role === "user"
      ? <ChatBubble key={`${message.role}-${index}`} role="user">{message.text}</ChatBubble>
      : <ChatBubble key={`${message.role}-${index}`} role="assistant">{message.text ?? ""}</ChatBubble>), [messages, setChangePath, setChangesOpen]);

  return (
    <section className={sidebarVisible ? "grid min-h-0 flex-1 md:grid-cols-[18rem_minmax(0,1fr)]" : "flex min-h-0 flex-1"} aria-label="Thread" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const files = Array.from(event.dataTransfer.files); if (files.length) void importAttachments(files).then((items) => { const next = [...attachments, ...items]; setAttachments(next); draftAttachmentsRef.current[thread?.threadId ?? "new"] = next; void saveProjection(thread, running ? "running" : "idle", prompt, next); }).catch((cause) => setError(String(cause))); }}>
      {sidebarVisible && <nav className="pb-sidebar flex min-h-0 flex-col overflow-hidden border-r p-3" aria-label="Threads">
        <h1 className="px-2 pb-4 pt-1 font-heading text-xl text-foreground">Pi<span className="text-primary">Ocarina</span></h1>
        <div hidden>{sidebarHeader}</div>
        <Button data-sidebar-row className="w-full justify-start" effects="row-highlight" size="sm" variant={!thread ? "secondary" : "ghost"} onClick={() => void newThread()}><MessageSquarePlusIcon />New thread</Button>
        <h2 className="px-2 pb-1 pt-5 text-xs text-muted-foreground" data-sidebar-heading>Projects</h2>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {organized.active.map((item) => <div className="group flex items-center [&>button:not(:first-child)]:opacity-0 [&>button:not(:first-child)]:focus:opacity-100 [&>button:not(:first-child)]:group-hover:opacity-100" key={item.sessionFile}>
          <Button data-sidebar-row aria-current={item.threadId === thread?.threadId || item.sessionFile === thread?.sessionFile ? "page" : undefined} className="min-w-0 flex-1 justify-start truncate" effects="row-highlight" size="sm" variant="ghost" onClick={() => void selectThread(item)}>{runningThreads.has(item.threadId ?? "") && <MatrixSpinner size={2} gap={1} label={`${item.title} running`} />}{attentionThreads.has(item.threadId ?? "") && <span aria-label="Needs attention" className="size-2 shrink-0 rounded-full bg-primary" />}{item.title}</Button>
          {(item.messageCount ?? 0) > (threadMetadata[item.sessionFile]?.read_message_count ?? 0) && item.sessionFile !== thread?.sessionFile && <span className="mt-3 size-2 rounded-full bg-primary" aria-label="Unread" />}
          <Button className="opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`${threadMetadata[item.sessionFile]?.pin_order == null ? "Pin" : "Unpin"} ${item.title}`} size="icon-sm" variant="ghost" onClick={() => setOrganization(togglePinned(threadMetadataRef.current, item.sessionFile))}><PinIcon /></Button>
          {threadMetadata[item.sessionFile]?.pin_order != null && <><Button aria-label={`Move ${item.title} up`} size="icon-sm" variant="ghost" onClick={() => setOrganization(movePinned(threadMetadataRef.current, item.sessionFile, -1))}><ArrowUpIcon /></Button><Button aria-label={`Move ${item.title} down`} size="icon-sm" variant="ghost" onClick={() => setOrganization(movePinned(threadMetadataRef.current, item.sessionFile, 1))}><ArrowDownIcon /></Button></>}
          <Button aria-label={`Archive ${item.title}`} size="icon-sm" variant="ghost" onClick={() => toggleArchive(item)}><ArchiveIcon /></Button>
          <Button aria-label={`Rename ${item.title}`} size="icon-sm" variant="ghost" onClick={() => { setRenameTarget(item); setRenameValue(item.title); }}><PencilIcon /></Button>
        </div>)}
        {organized.archived.length > 0 && <details><summary className="px-2 py-1 text-xs text-muted-foreground">Archived ({organized.archived.length})</summary>{organized.archived.map((item) => <div className="flex" key={item.sessionFile}><Button className="min-w-0 flex-1 justify-start truncate" size="sm" variant="ghost" onClick={() => void selectThread(item)}>{item.title}</Button><Button aria-label={`Restore ${item.title}`} size="icon-sm" variant="ghost" onClick={() => toggleArchive(item)}><RotateCcwIcon /></Button></div>)}</details>}
        {organized.active.length === 0 && organized.archived.length === 0 && <p className="px-2 pt-3 text-muted-foreground">No matching threads.</p>}
        </div>
      </nav>}
      <div className="pb-main-surface flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-6 pb-4 pt-8">
      <div hidden><Button size="sm" variant="ghost" onClick={() => setChangesOpen(true)}><FileDiffIcon />Changes</Button>{thread && <><Button size="sm" variant="ghost" onClick={() => setResourcesOpen(true)}>Resources</Button><Button size="sm" variant="ghost" disabled={running} onClick={() => void openTree()}><ListTreeIcon />Tree</Button></>}</div>
      <ChangesPanel workspaceId={workspace.id} open={changesOpen} {...(changePath ? { selectedPath: changePath } : {})} onClose={() => setChangesOpen(false)} />
      {thread?.schema?.newer && dismissedSkew !== thread.sessionFile && <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
        <span>This session was written by Pi schema {thread.schema.fileVersion}; this app supports {thread.schema.runtimeVersion}. It is read-only.</span>
        <Button type="button" variant="ghost" onClick={() => setDismissedSkew(thread.sessionFile)}>Dismiss</Button>
      </div>}
      <TranscriptViewport
        threadKey={thread?.threadId ?? "new"}
        {...(scrollPositionsRef.current[thread?.threadId ?? "new"] === undefined ? {} : { savedTop: scrollPositionsRef.current[thread?.threadId ?? "new"] })}
        contentKey={`${thread?.messages.length ?? 0}:${stream.length}`}
        onPosition={rememberScroll}
      >
        {!thread && <p className="text-sm text-muted-foreground">Start a new thread in this workspace.</p>}
        {transcriptItems}
        {stream && <ChatBubble role="assistant"><MarkdownMessage data-testid="streaming-response">{stream}</MarkdownMessage></ChatBubble>}
      </TranscriptViewport>
      <Composer
        workspaceId={workspace.id}
        value={prompt} running={running} disabled={Boolean(thread?.schema?.newer)}
        attachments={attachments} onAttachments={(items) => { setAttachments(items); draftAttachmentsRef.current[thread?.threadId ?? "new"] = items; void saveProjection(thread, running ? "running" : "idle", prompt, items); }} onAttachmentError={(message) => setError(message)}
        {...(thread?.commands === undefined ? {} : { commands: thread.commands })} {...(thread?.extensions === undefined ? {} : { extensions: thread.extensions })} models={models} model={activeModel}
        thinkingLevel={thread?.thinkingLevel ?? newThinking} {...(thread?.thinkingLevels === undefined ? {} : { thinkingLevels: thread.thinkingLevels })}
        onChange={(value) => { setPrompt(value); scheduleDraftSave(value); }} onDraftBlur={() => void flushDraftSave()}
        onSend={() => void submit()} onSteer={() => void enqueue("steer")} onStop={stopRun}
        onModelChange={(next) => void applyModel(next)} onThinkingChange={(level) => void applyThinking(level)}
      />
      <div hidden><ExtensionDock dock={dock} /></div>
      {notice && <p className="rounded-md border bg-muted p-2 text-sm" role="status">{notice}<Button className="ml-2" size="sm" variant="ghost" onClick={() => setNotice("")}>Dismiss</Button></p>}
      {queue.length > 0 && <div hidden aria-label="Queued messages" />}
      {thread && <Dialog open={resourcesOpen} onOpenChange={setResourcesOpen}><DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto"><DialogHeader className={undefined}><DialogTitle className={undefined}>Resources</DialogTitle><DialogDescription className={undefined}>Skills and extensions available to this thread.</DialogDescription></DialogHeader><section className="rounded-md border bg-card p-3 text-sm">
        <h3 className="font-medium">Skills ({thread.skills?.length ?? 0})</h3>
        <div className="mt-2 space-y-2">
          {thread.skills?.map((skill) => <div className="flex items-start justify-between gap-3" key={skill.path}>
            <div className="min-w-0"><p className="font-medium">/{skill.aliases[0]}</p><p className="text-muted-foreground">{skill.description}</p><p className="truncate text-xs text-muted-foreground">{skill.source} · {skill.path} · {skill.available ? "available" : "unavailable"}</p></div>
            <Button size="sm" variant="outline" onClick={() => void invokeTauri("reveal_skill", { workspace: workspace.path, path: skill.path }).catch((cause) => setError(String(cause)))}>Reveal</Button>
          </div>)}
          <Button size="sm" variant="ghost" onClick={() => void reloadResources()}><RefreshCwIcon />Reload</Button>
        </div>
      </section>
      <section className="rounded-md border bg-card p-3 text-sm">
        <h3 className="font-medium">Extensions ({thread.extensions?.length ?? 0})</h3>
        <div className="mt-2 space-y-2">{thread.extensions?.map((extension) => <div className="flex items-center justify-between gap-3" key={extension.source}><div className="min-w-0"><p className="font-medium">{extension.label}</p><p className="truncate text-xs text-muted-foreground">{extension.source} · {extension.scope}</p></div>{extension.managed && <Button size="sm" variant="outline" onClick={() => void requestAgent("setExtensionEnabled", { threadId: thread.threadId, source: extension.source, enabled: !extension.enabled }).then(setThread).catch((cause) => setError(String(cause)))}>{extension.enabled ? "Disable" : "Enable"}</Button>}</div>)}</div>
      </section></DialogContent></Dialog>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Dialog open={Boolean(runtimePrompt)} onOpenChange={(open: boolean) => { if (!open) resolvePrompt(true); }}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>{runtimePrompt?.title}</DialogTitle><DialogDescription className={undefined}>{runtimePrompt?.message}</DialogDescription></DialogHeader>
          {runtimePrompt?.kind === "select" ? <select className="h-9 rounded-md border bg-background px-3" value={runtimeValue} onChange={(event: ChangeEvent<HTMLSelectElement>) => setRuntimeValue(event.target.value)}>{runtimePrompt.options?.map((option) => <option key={option}>{option}</option>)}</select> : runtimePrompt?.kind === "editor" ? <Textarea aria-label="Runtime editor" className={undefined} value={runtimeValue} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setRuntimeValue(event.target.value)} /> : runtimePrompt?.kind !== "confirm" && <Input aria-label="Runtime input" className={undefined} type="text" value={runtimeValue} onChange={(event: ChangeEvent<HTMLInputElement>) => setRuntimeValue(event.target.value)} />}
          <DialogFooter className={undefined}><Button variant="outline" onClick={() => resolvePrompt(true)}>Cancel</Button><Button onClick={() => resolvePrompt(false)}>Continue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open: boolean) => { if (!open) setRenameTarget(null); }}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Rename thread</DialogTitle><DialogDescription className={undefined}>This name is saved in the Pi session.</DialogDescription></DialogHeader>
          <Input aria-label="Thread name" className={undefined} type="text" value={renameValue} onChange={(event: ChangeEvent<HTMLInputElement>) => setRenameValue(event.target.value)} />
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

function TreeNodes({ nodes, onFork, onNavigate, depth = 0 }: { nodes: ThreadTreeNode[]; onFork: (id: string) => Promise<void>; onNavigate: (id: string, summarize: boolean) => Promise<void>; depth?: number }) {
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
function reconcileTool(messages: Message[], tool: ToolCallPayload): Message[] {
  const index = messages.findIndex((message) => message.role === "tool" && message.toolCallId === tool.toolCallId);
  if (index < 0) return [...messages, { ...tool, role: "tool" }];
  return messages.map((message, position) => position === index ? { ...message, ...tool } : message);
}
