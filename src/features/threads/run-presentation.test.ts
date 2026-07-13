import assert from "node:assert/strict";
import test from "node:test";
import { formatRunDuration, presentRun, reduceRunEvent, reduceRunTool, runDisclosureLabel } from "./run-presentation";

test("run lifecycle keeps stable content and tool rows", () => {
  let run = reduceRunEvent(null, { threadId: "thread", runId: "run", kind: "start", timestamp: 1000 });
  run = reduceRunEvent(run, { threadId: "thread", runId: "run", kind: "content", contentKind: "thinking", text: "Plan", turn: 1, message: 1, contentIndex: 0 });
  run = reduceRunEvent(run, { threadId: "thread", runId: "run", kind: "content", contentKind: "thinking", text: "Plan more", turn: 1, message: 1, contentIndex: 0 });
  run = reduceRunTool(run, { threadId: "thread", runId: "run", toolCallId: "tool", toolName: "read", status: "running", input: { path: "README.md" } })!;
  run = reduceRunTool(run, { threadId: "thread", runId: "run", toolCallId: "tool", toolName: "read", status: "completed", output: "done" })!;
  assert.equal(run.messages.length, 2);
  assert.equal(run.messages[0]?.text, "Plan more");
  assert.equal(run.messages[1]?.status, "completed");
});

test("explicit final phase wins and fallback selects the last assistant text", () => {
  const explicit = presentRun([{ role: "assistant", text: "Work", phase: "commentary", contentKey: "a" }, { role: "assistant", text: "Done", phase: "final_answer", contentKey: "b" }]);
  assert.deepEqual(explicit.final.map((item) => item.text), ["Done"]);
  assert.deepEqual(explicit.process.map((item) => item.text), ["Work"]);
  const fallback = presentRun([{ role: "assistant", text: "First", contentKey: "a" }, { role: "tool", toolCallId: "x" }, { role: "assistant", text: "Last", contentKey: "b" }]);
  assert.deepEqual(fallback.final.map((item) => item.text), ["Last"]);
  assert.deepEqual(presentRun([{ role: "assistant", text: "Still working" }], false).final, []);
  assert.deepEqual(presentRun([{ role: "assistant", text: "Preparing" }, { role: "tool", toolCallId: "x" }]).final, []);
  assert.equal(formatRunDuration(0, 116_000), "1m 56s");
});

test("run labels distinguish active and terminal outcomes", () => {
  const base = { runId: "run", startedAt: 0, outcome: "completed" as const, startMessageIndex: 0, endMessageIndex: 1 };
  assert.equal(runDisclosureLabel(base, 5_000), "Working for 5s");
  assert.equal(runDisclosureLabel({ ...base, endedAt: 5_000 }), "Worked for 5s");
  assert.equal(runDisclosureLabel({ ...base, endedAt: 5_000, outcome: "stopped" }), "Stopped after 5s");
  assert.equal(runDisclosureLabel({ ...base, endedAt: 5_000, outcome: "failed" }), "Failed after 5s");
  assert.equal(runDisclosureLabel({ ...base, endedAt: 5_000, outcome: "interrupted" }), "Failed after 5s");
});
