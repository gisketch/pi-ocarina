// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SendIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

/** @typedef {{ role: string, text: string }} Message */
/** @typedef {{ threadId: string, sessionFile: string, messages: Message[] }} Thread */

/** @param {{ workspace: { path: string }, model: { provider: string, id: string } }} props */
export function ThreadRunner({ workspace, model }) {
  const [thread, setThread] = useState(/** @type {Thread | null} */ (null));
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  /** @param {string} operation @param {Record<string, unknown>} payload @param {(delta: string) => void} [onDelta] */
  const request = (operation, payload, onDelta = (_delta) => {}) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    void listen("agent-host-event", ({ payload: event }) => {
      if (event.requestId !== requestId) return;
      if (event.type === "messageDelta") onDelta(event.payload.delta);
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
      const completed = /** @type {Thread} */ (await request("promptThread", { threadId: active.threadId, prompt: text }, (delta) => setStream((value) => value + delta)));
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
        {thread?.messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-md bg-muted p-2 text-sm" : "mr-8 p-2 text-sm"}>
            {message.text}
          </p>
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
