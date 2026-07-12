import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentHostEvent } from "./agent";

test("tool lifecycle accepts preparing and rejects unknown statuses", () => {
  const event = parseAgentHostEvent({ version: 1, requestId: "run", type: "toolCall", payload: { threadId: "thread", toolCallId: "call", toolName: "write", status: "preparing", input: { path: "draft.txt" } } });
  assert.equal(event.type, "toolCall");
  if (event.type === "toolCall") assert.equal(event.payload.status, "preparing");
  assert.throws(() => parseAgentHostEvent({ version: 1, requestId: "run", type: "toolCall", payload: { threadId: "thread", status: "unknown" } }), /tool status/);
});
