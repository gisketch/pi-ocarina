// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SendIcon, StopCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

/** @typedef {{ role: string, text?: string, toolCallId?: string, toolName?: string, status?: string, input?: unknown, output?: unknown }} Message */
/** @typedef {{ threadId: string, sessionFile: string, messages: Message[] }} Thread */

/** @param {{ workspace: { id: string, path: string }, model: { provider: string, id: string } }} props */
export function ThreadRunner({ workspace, model }) {
  const [thread, setThread] = useState(/** @type {Thread | null} */ (null));
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(/** @type {string | null} */ (null));
  const [runtimePrompt, setRuntimePrompt] = useState(/** @type {any} */ (null));
  const [runtimeValue, setRuntimeValue] = useState("");

  useEffect(() => {
    /** @type {string | undefined} */
    let watchId;
    void invoke("app_state_snapshot").then(async ({ state }) => {
      const saved = state.windows?.main;
      if (!saved || saved.workspace_id !== workspace.id) return;
      setPrompt(saved.draft ?? "");
      if (!saved.active_thread_id || !saved.session_file) return;
      const recovered = /** @type {Thread & { runStatus?: string }} */ (await request("recoverThread", {
        cwd: workspace.path, threadId: saved.active_thread_id, sessionFile: saved.session_file,
      }));
      setThread(recovered);
      if (recovered.runStatus === "running") {
        watchId = crypto.randomUUID();
        void request("watchThread", { threadId: recovered.threadId }, (event) => {
          if (event.type === "messageDelta") setStream((value) => value + event.payload.delta);
          if (event.type === "toolCall") setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
        }, watchId).catch(() => {});
      }
      if (["interrupted", "missing"].includes(recovered.runStatus ?? "")) setError(recovered.runStatus === "missing" ? "Saved session is missing. Start a new thread." : "The previous run was interrupted. You can continue this thread.");
    }).catch((cause) => setError(String(cause)));
    return () => { if (watchId) void request("cancel", { requestId: watchId }).catch(() => {}); };
  }, [workspace.id, workspace.path]);

  /** @param {string} operation @param {Record<string, unknown>} payload @param {(event: any) => void} [onEvent] @param {string} [requestId] */
  const request = (operation, payload, onEvent = (_event) => {}, requestId = crypto.randomUUID()) => new Promise((resolve, reject) => {
    void listen("agent-host-event", ({ payload: event }) => {
      if (event.requestId !== requestId) return;
      if (["messageDelta", "toolCall", "runtimePrompt", "runtimeNotice"].includes(event.type)) onEvent(event);
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

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    if (!prompt.trim() || running) return;
    setRunning(true);
    setError("");
    setStream("");
    try {
      const active = thread ?? /** @type {Thread} */ (await request("createThread", {
        cwd: workspace.path,
        provider: model.provider,
        modelId: model.id,
      }));
      const text = prompt;
      setPrompt("");
      setThread({ ...active, messages: [...active.messages, { role: "user", text }] });
      void saveProjection(active, "running", "");
      const activeRunId = crypto.randomUUID();
      setRunId(activeRunId);
      const completed = /** @type {Thread} */ (await request("promptThread", { threadId: active.threadId, prompt: text }, (event) => {
        if (event.type === "messageDelta") setStream((value) => value + event.payload.delta);
        if (event.type === "toolCall") setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
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

  function saveProjection(active = thread, status = running ? "running" : "idle", draft = prompt) {
    return invoke("set_window_projection", { projection: {
      workspace_id: workspace.id, active_thread_id: active?.threadId ?? null,
      session_file: active?.sessionFile ?? null, draft, run_status: status,
    } });
  }

  function stopRun() {
    if (runId) void request("cancel", { requestId: runId }).catch((cause) => setError(String(cause)));
  }

  function resolvePrompt(cancelled = false) {
    if (!runtimePrompt) return;
    void request("resolveRuntimePrompt", { promptId: runtimePrompt.promptId, threadId: runtimePrompt.threadId, value: runtimePrompt.kind === "confirm" ? true : runtimeValue, cancelled });
    setRuntimePrompt(null);
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Thread">
      <div className="max-h-64 space-y-2 overflow-y-auto" data-testid="timeline">
        {thread?.messages.map((message, index) => message.role === "tool" ? <ToolRow key={message.toolCallId ?? index} tool={message} /> : (
          <p key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-md bg-muted p-2 text-sm" : "mr-8 p-2 text-sm"}>{message.text}</p>
        ))}
        {stream && <p className="mr-8 p-2 text-sm" data-testid="streaming-response">{stream}</p>}
      </div>
      <form className="flex gap-2" onSubmit={submit}>
        <Input aria-label="Message" className={undefined} type="text" value={prompt} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setPrompt(event.target.value)} onBlur={() => void saveProjection()} />
        {running ? <Button type="button" variant="destructive" onClick={stopRun}><StopCircleIcon />Stop</Button> : <Button type="submit" disabled={!prompt.trim()}><SendIcon />Send</Button>}
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Dialog open={Boolean(runtimePrompt)} onOpenChange={(/** @type {boolean} */ open) => { if (!open) resolvePrompt(true); }}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>{runtimePrompt?.title}</DialogTitle><DialogDescription className={undefined}>{runtimePrompt?.message}</DialogDescription></DialogHeader>
          {runtimePrompt?.kind === "select" ? <select className="h-9 rounded-md border bg-background px-3" value={runtimeValue} onChange={(/** @type {React.ChangeEvent<HTMLSelectElement>} */ event) => setRuntimeValue(event.target.value)}>{runtimePrompt.options?.map((/** @type {string} */ option) => <option key={option}>{option}</option>)}</select> : runtimePrompt?.kind !== "confirm" && <Input aria-label="Runtime input" className={undefined} type="text" value={runtimeValue} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setRuntimeValue(event.target.value)} />}
          <DialogFooter className={undefined}><Button variant="outline" onClick={() => resolvePrompt(true)}>Cancel</Button><Button onClick={() => resolvePrompt(false)}>Continue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
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
