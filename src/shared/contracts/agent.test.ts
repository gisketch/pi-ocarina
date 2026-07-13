import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentHostEvent } from "./agent";

test("tool lifecycle accepts preparing and rejects unknown statuses", () => {
  const event = parseAgentHostEvent({ version: 1, requestId: "run", type: "toolCall", payload: { threadId: "thread", toolCallId: "call", toolName: "write", status: "preparing", input: { path: "draft.txt" } } });
  assert.equal(event.type, "toolCall");
  if (event.type === "toolCall") assert.equal(event.payload.status, "preparing");
  assert.throws(() => parseAgentHostEvent({ version: 1, requestId: "run", type: "toolCall", payload: { threadId: "thread", status: "unknown" } }), /tool status/);
});

test("run lifecycle preserves valid phase metadata and ignores malformed optional fields", () => {
  const event = parseAgentHostEvent({ version: 1, requestId: "run", type: "runEvent", payload: { threadId: "thread", runId: "run-1", kind: "content", contentKind: "text", text: "Done", phase: "final_answer", contentIndex: 0 } });
  assert.equal(event.type, "runEvent");
  if (event.type === "runEvent") assert.equal(event.payload.phase, "final_answer");
  const malformed = parseAgentHostEvent({ version: 1, requestId: "run", type: "runEvent", payload: { threadId: "thread", runId: "run-1", kind: "content", phase: "unsupported", outcome: "unknown" } });
  assert.equal(malformed.type, "runEvent");
  if (malformed.type === "runEvent") assert.deepEqual({ phase: malformed.payload.phase, outcome: malformed.payload.outcome }, { phase: undefined, outcome: undefined });
  assert.throws(() => parseAgentHostEvent({ version: 1, requestId: "run", type: "runEvent", payload: { threadId: "thread", runId: "run-1", kind: "unknown" } }), /run event kind/);
});
