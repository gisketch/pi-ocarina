// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SendIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

/** @typedef {{ role: string, text?: string, toolCallId?: string, toolName?: string, status?: string, input?: unknown, output?: unknown }} Message */
/** @typedef {{ threadId: string, sessionFile: string, messages: Message[] }} Thread */

/** @param {{ workspace: { path: string }, model: { provider: string, id: string } }} props */
export function ThreadRunner({ workspace, model }) {
  const [thread, setThread] = useState(/** @type {Thread | null} */ (null));
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  /** @param {string} operation @param {Record<string, unknown>} payload @param {(event: any) => void} [onEvent] */
  const request = (operation, payload, onEvent = (_event) => {}) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    void listen("agent-host-event", ({ payload: event }) => {
      if (event.requestId !== requestId) return;
      if (["messageDelta", "toolCall"].includes(event.type)) onEvent(event);
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
      const completed = /** @type {Thread} */ (await request("promptThread", { threadId: active.threadId, prompt: text }, (event) => {
        if (event.type === "messageDelta") setStream((value) => value + event.payload.delta);
        if (event.type === "toolCall") setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
      }));
      setThread(completed);
      setStream("");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setRunning(false);
    }
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
        <Input aria-label="Message" className={undefined} type="text" value={prompt} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setPrompt(event.target.value)} disabled={running} />
        <Button type="submit" disabled={!prompt.trim() || running}><SendIcon />Send</Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
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
