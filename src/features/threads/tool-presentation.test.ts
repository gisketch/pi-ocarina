import assert from "node:assert/strict";
import test from "node:test";
import { presentTool, reconcileToolMessages } from "./tool-presentation";

test("built-in tools produce semantic summaries and visual details", () => {
  const bash = presentTool({ role: "tool", toolName: "bash", status: "completed", input: { command: "bun test" }, output: [{ type: "text", text: "10 pass" }] });
  assert.equal(bash.verb, "Ran"); assert.equal(bash.subject, "bun test"); assert.equal(bash.detail.kind, "terminal");
  const read = presentTool({ role: "tool", toolName: "read", status: "completed", input: { path: "src/App.tsx" }, output: "source" });
  assert.equal(read.verb, "Read"); assert.equal(read.detail.kind, "code");
  const edit = presentTool({ role: "tool", toolName: "edit", status: "completed", input: { path: "src/App.tsx", edits: [{ oldText: "old", newText: "new" }] } });
  assert.equal(edit.verb, "Edited"); assert.equal(edit.detail.kind, "diff");
  const write = presentTool({ role: "tool", toolName: "write", status: "completed", input: { path: "src/new.ts", content: "one\ntwo" }, output: "Created file" });
  assert.equal(write.verb, "Created"); assert.equal(write.detail.kind, "diff");
  const long = presentTool({ role: "tool", toolName: "bash", input: { command: "print" }, output: "x".repeat(13_000) });
  if (long.detail.kind === "terminal") assert.equal(long.detail.truncated, true);
});

test("discovery and extension tools stay readable without raw JSON", () => {
  const grep = presentTool({ role: "tool", toolName: "grep", status: "running", input: { pattern: "ToolCall", path: "src" }, output: "src/a.ts:1" });
  assert.equal(grep.status, "running"); assert.equal(grep.verb, "Searching"); assert.equal(grep.detail.kind, "list");
  assert.equal(presentTool({ role: "tool", toolName: "find", input: { pattern: "*.tsx" }, output: "src/App.tsx" }).verb, "Found");
  assert.equal(presentTool({ role: "tool", toolName: "ls", input: { path: "src" }, output: "App.tsx" }).verb, "Listed");
  const custom = presentTool({ role: "tool", toolName: "deploy_preview", status: "failed", input: { environment: "staging", nested: { secret: true } }, output: { content: [{ type: "text", text: "Denied" }] } });
  assert.equal(custom.verb, "Used Deploy preview"); assert.equal(custom.subject, "staging"); assert.equal(custom.detail.kind, "fields");
  if (custom.detail.kind === "fields") assert.deepEqual(custom.detail.fields, [{ label: "Environment", value: "staging" }, { label: "Nested", value: "Structured data" }]);
});

test("tool updates reconcile in place and preserve original input", () => {
  const running = { role: "tool", toolCallId: "call", toolName: "bash", status: "running", input: { command: "bun test" } };
  const completed = reconcileToolMessages([running], { role: "tool", toolCallId: "call", toolName: "bash", status: "completed", output: "pass" });
  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0]?.input, { command: "bun test" });
  assert.equal(completed[0]?.output, "pass");
  assert.equal(reconcileToolMessages([], { role: "tool", toolName: "custom" }).length, 1);
});
