import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("thread streams deltas and reopens the Pi-owned transcript", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const events = [];
  const persisted = [];
  let emitSession = () => {};
  const makeSession = async () => {
    const listeners = new Set();
    emitSession = (event) => listeners.forEach((listener) => listener(event));
    let ui;
    return { session: {
      sessionId: "thread-1",
      sessionFile: "/tmp/thread-1.jsonl",
      messages: persisted,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      async prompt(text) {
        persisted.push({ role: "user", content: text });
        ui.setEditorText("host replacement");
        listeners.forEach((listener) => listener({ type: "tool_execution_start", toolCallId: "call-1", toolName: "read", args: { path: "README.md" } }));
        listeners.forEach((listener) => listener({ type: "tool_execution_update", toolCallId: "call-1", toolName: "read", partialResult: "partial" }));
        listeners.forEach((listener) => listener({ type: "tool_execution_end", toolCallId: "call-1", toolName: "read", result: "done", isError: false }));
        await ui.input("Login", "Token");
        for (const delta of ["hel", "lo"]) {
          listeners.forEach((listener) => listener({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta },
          }));
        }
        persisted.push({ role: "assistant", content: [{ type: "text", text: "hello" }] });
      },
      async abort() {},
      dispose() {},
      extensionRunner: { setUIContext(value) { ui = value; } },
    } };
  };
  serve(
    input,
    output,
    makeSession,
    () => ({ authStorage: {}, modelRegistry: {}, model: {} }),
    async () => [{ path: "/tmp/thread-1.jsonl" }],
  );
  output.on("data", (chunk) => events.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const send = (requestId, operation, payload) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);

  send("create", "createThread", { cwd: "/tmp/workspace", provider: "test", modelId: "test" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("list", "listThreads", { cwd: "/tmp/workspace" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("prompt", "promptThread", { threadId: "thread-1", prompt: "hi" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("second-writer", "promptThread", { threadId: "thread-1", prompt: "race" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const runtimePrompt = events.find(({ requestId, type }) => requestId === "prompt" && type === "runtimePrompt");
  send("resolve", "resolveRuntimePrompt", { threadId: "thread-1", promptId: runtimePrompt.payload.promptId, value: "secret" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("open", "openThread", { cwd: "/tmp/workspace", sessionFile: "/tmp/thread-1.jsonl" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("recover", "recoverThread", { cwd: "/tmp/workspace", threadId: "thread-1", sessionFile: "/tmp/thread-1.jsonl" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("watch", "watchThread", { threadId: "thread-1" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  emitSession({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "live" } });
  send("cancel-watch", "cancel", { requestId: "watch" });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(events.filter(({ requestId, type }) => requestId === "prompt" && type === "messageDelta").map(({ payload }) => payload.delta), ["hel", "lo"]);
  assert.deepEqual(events.find(({ requestId, type }) => requestId === "list" && type === "completed").payload, [
    { sessionFile: "/tmp/thread-1.jsonl", title: "Empty thread" },
  ]);
  assert.equal(events.find(({ requestId, type }) => requestId === "prompt" && type === "editorText").payload.threadId, "thread-1");
  assert.deepEqual(events.filter(({ requestId, type }) => requestId === "prompt" && type === "toolCall").map(({ payload }) => payload.status), ["running", "running", "completed"]);
  assert.match(events.find(({ requestId, type }) => requestId === "second-writer" && type === "failed").payload.message, /already active/);
  assert.deepEqual(events.find(({ requestId, type }) => requestId === "open" && type === "completed").payload.messages, [
    { role: "user", text: "hi" },
    { role: "assistant", text: "hello" },
  ]);
  assert.equal(events.find(({ requestId, type }) => requestId === "recover" && type === "completed").payload.runStatus, "idle");
  assert.equal(events.find(({ requestId, type }) => requestId === "watch" && type === "messageDelta").payload.delta, "live");
});

test("manual thread name wins a delayed one-shot generated title", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const events = [];
  let name;
  let resolveTitle;
  let generated = 0;
  const session = {
    sessionId: "thread-name",
    sessionFile: "/tmp/thread-name.jsonl",
    messages: [],
    get sessionName() { return name; },
    setSessionName(value) { name = value; },
    subscribe() { return () => {}; },
    dispose() {},
  };
  serve(
    input,
    output,
    async () => ({ session }),
    () => ({ authStorage: {}, modelRegistry: {}, model: {} }),
    async () => [{ id: "thread-name", path: "/tmp/thread-name.jsonl", name }],
    () => { generated += 1; return new Promise((resolve) => { resolveTitle = resolve; }); },
  );
  output.on("data", (chunk) => events.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const send = (requestId, operation, payload) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);

  send("create-name", "createThread", { cwd: "/tmp/workspace", provider: "test", modelId: "test" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("auto-name", "generateThreadTitle", { threadId: "thread-name", prompt: "Generated title source" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("manual-name", "renameThread", { threadId: "thread-name", title: "  Manual title wins  " });
  await new Promise((resolve) => setTimeout(resolve, 5));
  resolveTitle("Ignored generated title");
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("later-name", "generateThreadTitle", { threadId: "thread-name", prompt: "Later prompts do not rename" });
  send("reopen-list", "listThreads", { cwd: "/tmp/workspace" });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(name, "Manual title wins");
  assert.equal(generated, 1);
  assert.equal(events.find(({ requestId, type }) => requestId === "auto-name" && type === "completed").payload.applied, false);
  assert.equal(events.filter(({ requestId, type }) => requestId === "auto-name" && type === "started").length, 1);
  assert.equal(events.find(({ requestId, type }) => requestId === "reopen-list" && type === "completed").payload[0].title, "Manual title wins");
});

test("real provider creates a persistent thread and answers", { skip: process.env.PI_OCARINA_REAL_PROVIDER !== "1" }, async () => {
  const [provider, modelId] = (process.env.PI_OCARINA_REAL_MODEL ?? "").split("/");
  assert.ok(provider && modelId, "set PI_OCARINA_REAL_MODEL=provider/model");
  const cwd = await mkdtemp(join(tmpdir(), "pi-ocarina-real-"));
  const input = new PassThrough();
  const output = new PassThrough();
  const events = [];
  serve(input, output);
  output.on("data", (chunk) => events.push(...chunk.toString().trim().split("\n").map(JSON.parse)));
  const send = (requestId, operation, payload) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);
  const terminal = (requestId) => new Promise((resolve) => {
    const timer = setInterval(() => {
      const event = events.find((item) => item.requestId === requestId && ["completed", "failed"].includes(item.type));
      if (event) { clearInterval(timer); resolve(event); }
    }, 10);
  });
  try {
    send("create-real", "createThread", { cwd, provider, modelId });
    const created = await terminal("create-real");
    assert.equal(created.type, "completed", created.payload.message);
    send("prompt-real", "promptThread", { threadId: created.payload.threadId, prompt: "Reply with OK." });
    const completed = await terminal("prompt-real");
    assert.equal(completed.type, "completed", completed.payload.message);
    assert.ok(completed.payload.messages.some(({ role, text }) => role === "assistant" && text));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
