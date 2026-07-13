import assert from "node:assert/strict";
import test from "node:test";
import { editorStats as diffStats, numberEditorLines as numberDiffLines } from "@/shared/ui/editor-model";
import { presentTool, reconcileToolMessages, settleActiveToolMessages } from "./tool-presentation";

test("built-in tools produce semantic summaries and visual details", () => {
  const bash = presentTool({ role: "tool", toolName: "bash", status: "completed", input: { command: "bun test" }, output: [{ type: "text", text: "10 pass" }] });
  assert.equal(bash.verb, "Ran"); assert.equal(bash.subject, "bun test"); assert.equal(bash.detail.kind, "terminal");
  const read = presentTool({ role: "tool", toolName: "read", status: "completed", input: { path: "src/App.tsx" }, output: "source" });
  assert.equal(read.verb, "Read"); assert.equal(read.detail.kind, "code");
  const edit = presentTool({ role: "tool", toolName: "edit", status: "completed", input: { path: "src/App.tsx", edits: [{ oldText: "old", newText: "new" }] } });
  assert.equal(edit.verb, "Edited"); assert.equal(edit.detail.kind, "diff");
  if (edit.detail.kind === "diff") {
    assert.deepEqual(diffStats(edit.detail.lines), { additions: 1, deletions: 1 });
    assert.deepEqual(numberDiffLines(edit.detail.lines).map(({ oldLine, newLine }) => [oldLine, newLine]), [[1, null], [null, 1]]);
  }
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
  const preparing = { role: "tool", toolCallId: "call", toolName: "bash", status: "preparing", input: { command: "bun" } };
  const running = reconcileToolMessages([preparing], { role: "tool", toolCallId: "call", toolName: "bash", status: "running", input: { command: "bun test" } });
  const completed = reconcileToolMessages(running, { role: "tool", toolCallId: "call", toolName: "bash", status: "completed", output: "pass" });
  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0]?.input, { command: "bun test" });
  assert.equal(completed[0]?.output, "pass");
  const latePreparing = reconcileToolMessages(completed, { role: "tool", toolCallId: "call", status: "preparing", input: { timeout: 30 } });
  assert.equal(latePreparing[0]?.status, "completed");
  assert.deepEqual(latePreparing[0]?.input, { command: "bun test", timeout: 30 });
  assert.equal(reconcileToolMessages([], { role: "tool", toolName: "custom" }).length, 1);
});

test("preparing tools use truthful progressive verbs and partial details", () => {
  const write = presentTool({ role: "tool", toolName: "write", status: "preparing", input: { path: "draft.txt", content: "Growing" } });
  assert.equal(write.verb, "Drafting"); assert.equal(write.detail.kind, "diff");
  const edit = presentTool({ role: "tool", toolName: "edit", status: "preparing", input: { path: "app.ts", edits: [{ oldText: "old", newText: "new" }] } });
  assert.equal(edit.verb, "Preparing changes to"); assert.equal(edit.detail.kind, "diff");
  assert.equal(presentTool({ role: "tool", toolName: "bash", status: "preparing", input: { command: "bun test" } }).verb, "Preparing");
  assert.equal(presentTool({ role: "tool", toolName: "read", status: "preparing", input: { path: "README.md" } }).verb, "Reading");

  const growingWrite = reconcileToolMessages(
    [{ role: "tool", toolCallId: "write", toolName: "write", status: "preparing", input: { path: "draft.txt", content: "Grow" } }],
    { role: "tool", toolCallId: "write", status: "preparing", input: { content: "Growing live" } },
  );
  const growingWritePresentation = presentTool(growingWrite[0]!);
  assert.equal(growingWritePresentation.subject, "draft.txt");
  if (growingWritePresentation.detail.kind === "diff") assert.equal(growingWritePresentation.detail.lines[0]?.text, "Growing live");

  const growingEdit = reconcileToolMessages(
    [{ role: "tool", toolCallId: "edit", toolName: "edit", status: "preparing", input: { path: "app.ts", edits: [{ oldText: "old", newText: "n" }] } }],
    { role: "tool", toolCallId: "edit", status: "preparing", input: { edits: [{ oldText: "old", newText: "new live" }] } },
  );
  const growingEditPresentation = presentTool(growingEdit[0]!);
  if (growingEditPresentation.detail.kind === "diff") assert.equal(growingEditPresentation.detail.lines.at(-1)?.text, "new live");
});

test("bash and extension partial output replace the existing live detail", () => {
  const bash = { role: "tool", toolCallId: "bash", toolName: "bash", status: "running", input: { command: "bun test" }, output: "first" };
  const updated = reconcileToolMessages([bash], { role: "tool", toolCallId: "bash", status: "running", output: { content: [{ type: "text", text: "first\nsecond" }] } });
  const bashPresentation = presentTool(updated[0]!);
  assert.equal(updated.length, 1);
  if (bashPresentation.detail.kind === "terminal") assert.equal(bashPresentation.detail.content, "first\nsecond");

  const extension = reconcileToolMessages(
    [{ role: "tool", toolCallId: "extension", toolName: "deploy_preview", status: "preparing", input: { environment: "staging" } }],
    { role: "tool", toolCallId: "extension", status: "running", output: "Uploading 50%" },
  );
  const extensionPresentation = presentTool(extension[0]!);
  assert.equal(extensionPresentation.verb, "Running Deploy preview");
  if (extensionPresentation.detail.kind === "fields") assert.equal(extensionPresentation.detail.content, "Uploading 50%");
});

test("interruption settles every active tool without changing completed history", () => {
  const settled = settleActiveToolMessages([
    { role: "tool", toolCallId: "draft", status: "preparing" },
    { role: "tool", toolCallId: "command", status: "running", output: "partial" },
    { role: "tool", toolCallId: "done", status: "completed" },
  ]);
  assert.deepEqual(settled.map(({ status }) => status), ["failed", "failed", "completed"]);
  assert.equal(settled[0]?.output, "Tool interrupted");
  assert.equal(settled[1]?.output, "partial");
});
