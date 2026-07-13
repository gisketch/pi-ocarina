import type { ThreadMessage } from "@/shared/contracts/app";

export type ToolStatus = "preparing" | "running" | "completed" | "failed";
export type ToolDetail =
  | { kind: "terminal"; command: string; content: string; truncated: boolean }
  | { kind: "code"; path: string; content: string; truncated: boolean }
  | { kind: "diff"; path: string; lines: Array<{ kind: "add" | "remove" | "context"; text: string }>; truncated: boolean }
  | { kind: "list"; content: string; truncated: boolean }
  | { kind: "fields"; fields: Array<{ label: string; value: string }>; content: string; truncated: boolean }
  | { kind: "none" };

export type ToolPresentation = { name: string; status: ToolStatus; verb: string; subject: string; path?: string; detail: ToolDetail };
const detailLimit = 12_000;
const summaryLimit = 180;

export function presentTool(tool: ThreadMessage): ToolPresentation {
  const name = typeof tool.toolName === "string" && tool.toolName.trim() ? tool.toolName.trim() : "tool";
  const normalized = name.toLowerCase();
  const input = record(tool.input);
  const output = outputText(tool.output);
  const status = normalizeStatus(tool.status);
  const known = normalized === "bash" ? bash(input, output, status)
    : normalized === "read" ? read(input, output, status)
      : normalized === "edit" ? edit(input, status)
        : normalized === "write" ? write(input, output, status)
          : normalized === "grep" ? discovery("Searching", "Searched", name, input, output, status, "pattern")
            : normalized === "find" ? discovery("Finding", "Found", name, input, output, status, "pattern")
              : normalized === "ls" ? discovery("Listing", "Listed", name, input, output, status, "path")
                : undefined;
  return known ?? generic(name, input, output, status);
}

export function reconcileToolMessages(messages: ThreadMessage[], tool: ThreadMessage): ThreadMessage[] {
  if (!tool.toolCallId) return [...messages, { ...tool, role: "tool" }];
  const index = messages.findIndex((message) => message.role === "tool" && message.toolCallId === tool.toolCallId);
  if (index < 0) return [...messages, { ...tool, role: "tool" }];
  return messages.map((message, position) => position === index ? {
    ...message,
    ...tool,
    status: reconcileStatus(message.status, tool.status),
    input: mergeInput(message.input, tool.input),
    output: tool.output === undefined ? message.output : tool.output,
  } : message);
}

export function settleActiveToolMessages(messages: ThreadMessage[], output = "Tool interrupted"): ThreadMessage[] {
  return messages.map((message) => message.role === "tool" && (message.status === "preparing" || message.status === "running")
    ? { ...message, status: "failed", output: message.output ?? output }
    : message);
}

function bash(input: Record<string, unknown> | undefined, output: string, status: ToolStatus): ToolPresentation | undefined {
  const command = string(input?.command);
  if (!command) return undefined;
  return { name: "bash", status, verb: status === "preparing" ? "Preparing" : status === "running" ? "Running" : "Ran", subject: summary(command), detail: { kind: "terminal", command, ...bounded(output) } };
}

function read(input: Record<string, unknown> | undefined, output: string, status: ToolStatus): ToolPresentation | undefined {
  const path = string(input?.path) ?? string(input?.file_path);
  if (!path) return undefined;
  return { name: "read", status, verb: active(status) ? "Reading" : "Read", subject: path, path, detail: { kind: "code", path, ...bounded(output) } };
}

function edit(input: Record<string, unknown> | undefined, status: ToolStatus): ToolPresentation | undefined {
  const path = string(input?.path);
  const edits = Array.isArray(input?.edits) ? input.edits : input && typeof input.oldText === "string" && typeof input.newText === "string" ? [{ oldText: input.oldText, newText: input.newText }] : [];
  if (!path || edits.length === 0) return undefined;
  const lines: Array<{ kind: "add" | "remove" | "context"; text: string }> = [];
  for (const value of edits) {
    const item = record(value);
    const oldText = string(item?.oldText);
    const newText = string(item?.newText);
    if (oldText === undefined || newText === undefined) continue;
    if (lines.length) lines.push({ kind: "context", text: "⋯" });
    lines.push(...oldText.split("\n").map((text) => ({ kind: "remove" as const, text })));
    lines.push(...newText.split("\n").map((text) => ({ kind: "add" as const, text })));
  }
  if (!lines.length) return undefined;
  const visible = lines.slice(0, 500);
  return { name: "edit", status, verb: status === "preparing" ? "Preparing changes to" : status === "running" ? "Editing" : "Edited", subject: path, path, detail: { kind: "diff", path, lines: visible, truncated: visible.length < lines.length } };
}

function write(input: Record<string, unknown> | undefined, output: string, status: ToolStatus): ToolPresentation | undefined {
  const path = string(input?.path);
  const content = string(input?.content);
  if (!path || content === undefined) return undefined;
  const verb = status === "preparing" ? "Drafting" : status === "running" ? "Writing" : /\bcreated\b/i.test(output) ? "Created" : /\bupdated\b/i.test(output) ? "Updated" : "Wrote";
  const lines = content.split("\n");
  const visible = lines.slice(0, 500).map((text) => ({ kind: "add" as const, text }));
  return { name: "write", status, verb, subject: path, path, detail: { kind: "diff", path, lines: visible, truncated: visible.length < lines.length } };
}

function discovery(runningVerb: string, completedVerb: string, name: string, input: Record<string, unknown> | undefined, output: string, status: ToolStatus, subjectKey: string): ToolPresentation | undefined {
  if (!input) return undefined;
  const subject = string(input[subjectKey]) ?? (subjectKey !== "path" ? string(input.path) : undefined) ?? ".";
  return { name, status, verb: active(status) ? runningVerb : completedVerb, subject: summary(subject), detail: { kind: "list", ...bounded(output) } };
}

function generic(name: string, input: Record<string, unknown> | undefined, output: string, status: ToolStatus): ToolPresentation {
  const fields = input ? Object.entries(input).flatMap(([label, value]) => {
    const formatted = primitive(value);
    return formatted === undefined ? [] : [{ label: humanize(label), value: formatted }];
  }).slice(0, 8) : [];
  return { name, status, verb: status === "preparing" ? `Preparing ${humanize(name)}` : status === "running" ? `Running ${humanize(name)}` : `Used ${humanize(name)}`, subject: fields[0]?.value ?? "", detail: fields.length || output ? { kind: "fields", fields, ...bounded(output) } : { kind: "none" } };
}

function outputText(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => outputText(item, depth + 1)).filter(Boolean).join("\n");
  const item = record(value);
  if (!item) return "";
  if (item.type === "text" && typeof item.text === "string") return item.text;
  if (item.content !== undefined) return outputText(item.content, depth + 1);
  if (typeof item.output === "string") return item.output;
  if (typeof item.message === "string") return item.message;
  return "";
}

function bounded(value: string) { return value.length > detailLimit ? { content: value.slice(0, detailLimit), truncated: true } : { content: value, truncated: false }; }
function normalizeStatus(status: string | undefined): ToolStatus { return status === "preparing" ? "preparing" : status === "running" ? "running" : status === "failed" ? "failed" : "completed"; }
function active(status: ToolStatus) { return status === "preparing" || status === "running"; }
function reconcileStatus(previous: string | undefined, next: string | undefined) {
  if (next === undefined) return previous;
  const rank = (status: string | undefined) => status === "completed" || status === "failed" ? 2 : status === "running" ? 1 : status === "preparing" ? 0 : -1;
  return rank(next) < rank(previous) ? previous : next;
}
function mergeInput(previous: unknown, next: unknown) {
  if (next === undefined) return previous;
  const before = record(previous);
  const after = record(next);
  if (before && after) return { ...before, ...after };
  return before && !after ? previous : next;
}
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function string(value: unknown) { return typeof value === "string" ? value : undefined; }
function summary(value: string) { return value.length > summaryLimit ? `${value.slice(0, summaryLimit - 1)}…` : value; }
function humanize(value: string) { return value.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase()); }
function primitive(value: unknown): string | undefined {
  if (typeof value === "string") return summary(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) return summary(value.join(", "));
  if (Array.isArray(value)) return `Structured list (${value.length})`;
  if (value !== null && typeof value === "object") return "Structured data";
  return undefined;
}
