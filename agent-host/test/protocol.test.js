import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { serve } from "../src/host.js";

test("JSONL bridge validates, interleaves requests, and cancels once", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  serve(input, output);
  const events = [];
  output.on("data", (chunk) => events.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const send = (value) => input.write(`${JSON.stringify(value)}\n`);

  send({ version: 1, requestId: "slow", operation: "wait", payload: { ms: 100 } });
  send({ version: 1, requestId: "slow", operation: "wait", payload: { ms: 1 } });
  send({ version: 1, requestId: "fast", operation: "wait", payload: { ms: 1 } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  send({ version: 1, requestId: "cancel", operation: "cancel", payload: { requestId: "slow" } });
  input.write("not-json\n");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(events.filter(({ requestId }) => requestId === "fast").map(({ type }) => type), ["started", "completed"]);
  assert.deepEqual(
    events.filter(({ requestId, type }) => requestId === "slow" && type !== "failed").map(({ type }) => type),
    ["started", "cancelled"],
  );
  assert.equal(
    events.some(
      ({ requestId, type, payload }) =>
        requestId === "slow" && type === "failed" && payload.message.includes("already active"),
    ),
    true,
  );
  assert.equal(events.some(({ requestId, type }) => requestId === "cancel" && type === "completed"), true);
  assert.equal(events.some(({ requestId, type }) => requestId === "unknown" && type === "failed"), true);
});

test("cancellation reaches the active Pi session", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const events = [];
  let aborted = 0;
  let finishPrompt;
  const session = {
    prompt: () => new Promise((resolve) => { finishPrompt = resolve; }),
    abort: async () => { aborted += 1; finishPrompt(); },
    dispose() {},
  };
  serve(input, output, async () => ({ session }),);
  output.on("data", (chunk) => events.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const send = (value) => input.write(`${JSON.stringify(value)}\n`);

  send({ version: 1, requestId: "run", operation: "prompt", payload: { prompt: "hello" } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send({ version: 1, requestId: "cancel", operation: "cancel", payload: { requestId: "run" } });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(aborted, 1);
  assert.deepEqual(events.filter(({ requestId }) => requestId === "run").map(({ type }) => type), ["started", "cancelled"]);
});
