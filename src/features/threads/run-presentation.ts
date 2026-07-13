import type { RunEventPayload, ToolCallPayload } from "@/shared/contracts/agent";
import type { RunMetadata, RunOutcome, ThreadMessage } from "@/shared/contracts/app";
import { reconcileToolMessages } from "./tool-presentation";

export type LiveRun = { metadata: RunMetadata; messages: ThreadMessage[] };
export type PresentedRun = { process: ThreadMessage[]; final: ThreadMessage[] };

export function reduceRunEvent(current: LiveRun | null, event: RunEventPayload): LiveRun {
  const run = current?.metadata.runId === event.runId ? current : {
    metadata: { runId: event.runId, startedAt: event.timestamp ?? Date.now(), outcome: "completed" as const, startMessageIndex: 0, endMessageIndex: 0 },
    messages: [],
  };
  if (event.kind === "start") return { ...run, metadata: { ...run.metadata, startedAt: event.timestamp ?? run.metadata.startedAt } };
  if (event.kind === "end") return { ...run, metadata: { ...run.metadata, endedAt: event.timestamp ?? Date.now(), outcome: event.outcome ?? "completed" } };
  if (event.kind !== "content" || !event.contentKind || !event.text) return run;
  const contentKey = `${event.turn ?? 0}:${event.message ?? 0}:${event.contentIndex ?? 0}`;
  const message: ThreadMessage = { role: event.contentKind === "thinking" ? "thinking" : "assistant", text: event.text, runId: event.runId, contentKey, ...(event.phase ? { phase: event.phase } : {}) };
  const index = run.messages.findIndex((item) => item.contentKey === contentKey);
  return { ...run, messages: index < 0 ? [...run.messages, message] : run.messages.map((item, position) => position === index ? { ...item, ...message } : item) };
}

export function reduceRunTool(current: LiveRun | null, tool: ToolCallPayload): LiveRun | null {
  if (!tool.runId) return current;
  const run = current?.metadata.runId === tool.runId ? current : {
    metadata: { runId: tool.runId, startedAt: Date.now(), outcome: "completed" as const, startMessageIndex: 0, endMessageIndex: 0 },
    messages: [],
  };
  return { ...run, messages: reconcileToolMessages(run.messages, { ...tool, role: "tool" }) };
}

export function settleLiveRun(current: LiveRun | null, outcome: RunOutcome, endedAt = Date.now()) {
  return current ? { ...current, metadata: { ...current.metadata, outcome, endedAt } } : null;
}

export function presentRun(messages: ThreadMessage[], allowFallback = true): PresentedRun {
  const explicit = messages.filter((message) => message.role === "assistant" && message.phase === "final_answer" && message.text?.trim());
  const lastTool = messages.reduce((index, message, position) => message.role === "tool" ? position : index, -1);
  const fallback = explicit.length || !allowFallback ? [] : messages.slice(lastTool + 1).filter((message) => message.role === "assistant" && message.text?.trim()).slice(-1);
  const final = explicit.length ? explicit : fallback;
  const finalKeys = new Set(final.map((message) => message.contentKey ?? message));
  return { process: messages.filter((message) => !finalKeys.has(message.contentKey ?? message) && message.role !== "user"), final };
}

export function formatRunDuration(startedAt: number, endedAt: number) {
  const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function runDisclosureLabel(metadata: RunMetadata, now = Date.now()) {
  const duration = formatRunDuration(metadata.startedAt, metadata.endedAt ?? now);
  if (metadata.endedAt === undefined) return `Working for ${duration}`;
  if (metadata.outcome === "completed") return `Worked for ${duration}`;
  if (metadata.outcome === "stopped") return `Stopped after ${duration}`;
  return `Failed after ${duration}`;
}
