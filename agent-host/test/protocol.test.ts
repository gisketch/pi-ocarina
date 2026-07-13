import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { preparePrompt, serve } from "../src/host.js";

type EventPayload = {
  applied: boolean;
  commands: Array<{ name: string }>;
  delta: string;
  items: Array<{ mode: string }>;
  message: string;
  messages: Array<{ role: string; text?: string; toolName?: string; status?: string; phase?: string }>;
  model: { id: string };
  nodes: Array<{ children: Array<{ preview: string }> }>;
  promptId: string;
  runStatus: string;
  skills: Array<Record<string, unknown>>;
  status: string;
  thinkingLevel: string;
  threadId: string;
  title: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  runId: string;
  kind: string;
  phase: string;
  runs: Array<{ outcome: string }>;
} & Array<{ title: string }>;
type WireEvent = { requestId: string; type: string; payload: EventPayload };
type SessionListener = (event: unknown) => void;
type RuntimeUiStub = { input: (title: string, placeholder?: string) => Promise<unknown>; setEditorText: (text: string) => void };
type CreateSessionDependency = Parameters<typeof serve>[2];
type ResolveModelDependency = Parameters<typeof serve>[3];
type ListSessionsDependency = Parameters<typeof serve>[4];
type GenerateTitleDependency = Parameters<typeof serve>[5];

const asCreateSession = (value: unknown) => value as CreateSessionDependency;
const asResolveModel = (value: unknown) => value as ResolveModelDependency;
const asListSessions = (value: unknown) => value as ListSessionsDependency;
const asGenerateTitle = (value: unknown) => value as GenerateTitleDependency;
const parseWireEvents = (chunk: Buffer): WireEvent[] => chunk.toString().trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as WireEvent);
function requiredEvent(events: WireEvent[], requestId: string, type: string) {
  const event = events.find((item) => item.requestId === requestId && item.type === type);
  assert.ok(event, `missing ${requestId}:${type}`);
  return event;
}

test("attachments become Pi image content and file context", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-attachments-"));
  try {
    const image = join(root, "tiny.png");
    const file = join(root, "notes.txt");
    await import("node:fs/promises").then(({ writeFile }) => Promise.all([writeFile(image, "image"), writeFile(file, "notes")]));
    const prepared = await preparePrompt("review", [
      { path: image, name: "tiny.png", kind: "image" },
      { path: file, name: "notes.txt", kind: "file" },
    ]);
    assert.equal(prepared.images[0]?.mimeType, "image/png");
    assert.match(prepared.text, /notes\.txt/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("two Pi sessions run concurrently without event bleed", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const events: WireEvent[] = [];
  let count = 0;
  type ParallelSession = {
    sessionId: string;
    sessionFile: string;
    messages: never[];
    model: null;
    thinkingLevel: "off";
    getAvailableThinkingLevels: () => ["off"];
    subscribe: (listener: SessionListener) => () => boolean;
    prompt: () => Promise<void>;
    abort: () => Promise<void>;
    dispose: () => void;
    finish?: () => void;
  };
  const sessions: ParallelSession[] = [];
  const createSession = async () => {
    const listeners = new Set<SessionListener>();
    const id = `parallel-${++count}`;
    const session: ParallelSession = {
      sessionId: id, sessionFile: `/tmp/${id}.jsonl`, messages: [], model: null, thinkingLevel: "off",
      getAvailableThinkingLevels: () => ["off"],
      subscribe(listener: SessionListener) { listeners.add(listener); return () => listeners.delete(listener); },
      prompt: () => new Promise<void>((resolve) => { session.finish = () => { listeners.forEach((listener) => listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: id } })); resolve(); }; }),
      async abort() { session.finish?.(); }, dispose() {},
    };
    sessions.push(session);
    return { session };
  };
  serve(input, output, asCreateSession(createSession), asResolveModel(() => ({ authStorage: {}, modelRegistry: {}, model: {} })));
  output.on("data", (chunk) => events.push(...parseWireEvents(chunk)));
  const send = (requestId: string, operation: string, payload: Record<string, unknown>) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);
  send("create-a", "createThread", { cwd: "/tmp", provider: "x", modelId: "x" });
  send("create-b", "createThread", { cwd: "/tmp", provider: "x", modelId: "x" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("run-a", "promptThread", { threadId: "parallel-1", prompt: "a" });
  send("run-b", "promptThread", { threadId: "parallel-2", prompt: "b" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  sessions[1]?.finish?.(); sessions[0]?.finish?.();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(requiredEvent(events, "run-a", "messageDelta").payload.threadId, "parallel-1");
  assert.equal(requiredEvent(events, "run-b", "messageDelta").payload.threadId, "parallel-2");
});

test("JSONL bridge validates, interleaves requests, and cancels once", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  serve(input, output);
  const events: WireEvent[] = [];
  output.on("data", (chunk) => events.push(...parseWireEvents(chunk)));
  const send = (value: Record<string, unknown>) => input.write(`${JSON.stringify(value)}\n`);

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
  const events: WireEvent[] = [];
  let aborted = 0;
  let finishPrompt: () => void = () => {};
  const session = {
    prompt: () => new Promise<void>((resolve) => { finishPrompt = resolve; }),
    abort: async () => { aborted += 1; finishPrompt(); },
    dispose() {},
  };
  serve(input, output, asCreateSession(async () => ({ session })));
  output.on("data", (chunk) => events.push(...parseWireEvents(chunk)));
  const send = (value: Record<string, unknown>) => input.write(`${JSON.stringify(value)}\n`);

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
  const events: WireEvent[] = [];
  const persisted: Array<Record<string, unknown>> = [];
  const customEntries: Array<Record<string, unknown>> = [];
  type PackageSettingStub = { source: string; skills: string[]; extensions?: string[] };
  let globalSettings: { packages: PackageSettingStub[] } = { packages: [{ source: "@scope/proof", skills: ["skills/**"] }] };
  let reloads = 0;
  let emitSession: SessionListener = () => {};
  const makeSession = async () => {
    const listeners = new Set<SessionListener>();
    emitSession = (event: unknown) => listeners.forEach((listener) => listener(event));
    let ui: RuntimeUiStub | undefined;
    let steering: string[] = [];
    let followUps: string[] = [];
    return { session: {
      sessionId: "thread-1",
      sessionFile: "/tmp/thread-1.jsonl",
      messages: persisted,
      model: { provider: "test", id: "old", name: "Old" },
      thinkingLevel: "low",
      sessionManager: {
        appendCustomEntry(customType: string, data: unknown) { customEntries.push({ type: "custom", customType, data }); },
        getEntries: () => customEntries,
      },
      getAvailableThinkingLevels: () => ["off", "low", "high"],
      setThinkingLevel(level: string) { this.thinkingLevel = level; },
      async setModel(model: { provider: string; id: string; name: string }) { this.model = model; },
      promptTemplates: [{ name: "review", description: "Review changes" }],
      resourceLoader: { getSkills: () => ({ skills: [{ name: "ship", description: "Ship it", filePath: "/tmp/workspace/.pi/skills/ship/SKILL.md", sourceInfo: { source: "project", scope: "project" }, disableModelInvocation: false }] }) },
      settingsManager: {
        getGlobalSettings: () => globalSettings,
        getProjectSettings: () => ({}),
        setPackages(packages: PackageSettingStub[]) { globalSettings = { ...globalSettings, packages }; },
        setProjectPackages() {}, setExtensionPaths() {}, setProjectExtensionPaths() {}, async flush() {},
      },
      async reload() { reloads += 1; },
      subscribe(listener: SessionListener) { listeners.add(listener); return () => listeners.delete(listener); },
      async prompt(text: string) {
        listeners.forEach((listener) => listener({ type: "agent_start" }));
        listeners.forEach((listener) => listener({ type: "turn_start" }));
        persisted.push({ role: "user", content: text });
        persisted.push({ role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } }] });
        persisted.push({ role: "toolResult", toolCallId: "call-1", toolName: "read", content: [{ type: "text", text: "README content" }], isError: false });
        ui?.setEditorText("host replacement");
        listeners.forEach((listener) => listener({
          type: "message_update",
          message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "READ" } }] },
          assistantMessageEvent: { type: "toolcall_delta", delta: "READ" },
        }));
        listeners.forEach((listener) => listener({
          type: "message_update",
          message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } }] },
          assistantMessageEvent: { type: "toolcall_delta", delta: "ME.md" },
        }));
        listeners.forEach((listener) => listener({ type: "tool_execution_start", toolCallId: "call-1", toolName: "read", args: { path: "README.md" } }));
        listeners.forEach((listener) => listener({ type: "tool_execution_update", toolCallId: "call-1", toolName: "read", partialResult: "partial" }));
        listeners.forEach((listener) => listener({ type: "tool_execution_end", toolCallId: "call-1", toolName: "read", result: "done", isError: false }));
        const interrupted = { role: "assistant", content: [{ type: "toolCall", id: "call-2", name: "write", arguments: { path: "cancelled.txt", content: "draft" } }], stopReason: "aborted", errorMessage: "Cancelled" };
        listeners.forEach((listener) => listener({ type: "message_update", message: interrupted, assistantMessageEvent: { type: "toolcall_delta", delta: "draft" } }));
        listeners.forEach((listener) => listener({ type: "message_end", message: interrupted }));
        await ui?.input("Login", "Token");
        listeners.forEach((listener) => listener({ type: "message_start", message: { role: "assistant", content: [] } }));
        let response = "";
        for (const delta of ["hel", "lo"]) {
          response += delta;
          listeners.forEach((listener) => listener({
            type: "message_update",
            message: { role: "assistant", content: [{ type: "text", text: response, textSignature: JSON.stringify({ v: 1, phase: "final_answer" }) }] },
            assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta },
          }));
        }
        const answer = { role: "assistant", content: [{ type: "text", text: "hello", textSignature: JSON.stringify({ v: 1, phase: "final_answer" }) }] };
        persisted.push(answer);
        listeners.forEach((listener) => listener({ type: "message_end", message: answer }));
        listeners.forEach((listener) => listener({ type: "turn_end", message: answer, toolResults: [] }));
        listeners.forEach((listener) => listener({ type: "agent_end", messages: [answer] }));
      },
      async abort() {},
      async steer(text: string) { steering = [...steering, text]; },
      async followUp(text: string) { followUps = [...followUps, text]; },
      clearQueue() { steering = []; followUps = []; return { steering: [], followUp: [] }; },
      dispose() {},
      extensionRunner: {
        setUIContext(value: RuntimeUiStub) { ui = value; },
        getRegisteredCommands: () => [{ invocationName: "deploy", description: "Deploy" }],
      },
    } };
  };
  serve(
    input,
    output,
    asCreateSession(makeSession),
    asResolveModel(({ provider, modelId }: { provider: string; modelId: string }) => ({ authStorage: {}, modelRegistry: {}, model: { provider, id: modelId, name: modelId } })),
    asListSessions(async () => [{ path: "/tmp/thread-1.jsonl" }]),
  );
  output.on("data", (chunk) => events.push(...parseWireEvents(chunk)));
  const send = (requestId: string, operation: string, payload: Record<string, unknown>) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);

  send("create", "createThread", { cwd: "/tmp/workspace", provider: "test", modelId: "test" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("set-model", "setThreadModel", { threadId: "thread-1", provider: "test", modelId: "new" });
  send("set-thinking", "setThreadThinking", { threadId: "thread-1", thinkingLevel: "high" });
  send("reload", "reloadResources", { threadId: "thread-1" });
  send("disable-extension", "setExtensionEnabled", { threadId: "thread-1", source: "@scope/proof", enabled: false });
  send("reject-extension", "setExtensionEnabled", { threadId: "thread-1", source: "../../unknown", enabled: false });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("list", "listThreads", { cwd: "/tmp/workspace" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("prompt", "promptThread", { threadId: "thread-1", prompt: "hi" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  send("second-writer", "promptThread", { threadId: "thread-1", prompt: "race" });
  send("queue", "queueThread", { threadId: "thread-1", prompt: "later", mode: "followUp" });
  send("steer", "queueThread", { threadId: "thread-1", prompt: "now", mode: "steer" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const runtimePrompt = requiredEvent(events, "prompt", "runtimePrompt");
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
  assert.equal(requiredEvent(events, "set-model", "completed").payload.model.id, "new");
  assert.equal(requiredEvent(events, "set-thinking", "completed").payload.thinkingLevel, "high");
  assert.deepEqual(requiredEvent(events, "create", "completed").payload.commands.map(({ name }) => name), ["deploy", "review"]);
  assert.deepEqual(requiredEvent(events, "reload", "completed").payload.skills[0], {
    name: "ship", description: "Ship it", path: "/tmp/workspace/.pi/skills/ship/SKILL.md", source: "project", scope: "project", available: true, aliases: ["skill:ship"], disableModelInvocation: false,
  });
  assert.deepEqual(globalSettings.packages, [{ source: "@scope/proof", skills: ["skills/**"], extensions: [] }]);
  assert.equal(reloads, 2);
  assert.equal(requiredEvent(events, "reject-extension", "failed").payload.message, "Agent run failed. Check provider settings and try again.");
  assert.deepEqual(requiredEvent(events, "list", "completed").payload, [
    { sessionFile: "/tmp/thread-1.jsonl", title: "Empty thread" },
  ]);
  assert.equal(requiredEvent(events, "prompt", "editorText").payload.threadId, "thread-1");
  const toolEvents = events.filter(({ requestId, type, payload }) => requestId === "prompt" && type === "toolCall" && payload.toolCallId === "call-1").map(({ payload }) => payload);
  assert.deepEqual(toolEvents.map(({ status }) => status), ["preparing", "running", "running", "completed"]);
  assert.deepEqual(toolEvents[0]?.input, { path: "README.md" });
  assert.ok(toolEvents.every(({ runId }) => typeof runId === "string"));
  const runEvents = events.filter(({ requestId, type }) => requestId === "prompt" && type === "runEvent").map(({ payload }) => payload);
  assert.deepEqual(runEvents.filter(({ kind }) => kind !== "content").map(({ kind }) => kind), ["start", "turnStart", "end"]);
  assert.equal([...runEvents].reverse().find(({ kind }) => kind === "content")?.phase, "final_answer");
  assert.deepEqual(events.filter(({ requestId, type, payload }) => requestId === "prompt" && type === "toolCall" && payload.toolCallId === "call-2").map(({ payload }) => payload.status), ["preparing", "failed"]);
  assert.match(requiredEvent(events, "second-writer", "failed").payload.message, /already active/);
  assert.equal(requiredEvent(events, "queue", "completed").payload.items[0]?.mode, "followUp");
  assert.equal(requiredEvent(events, "steer", "completed").payload.items[1]?.mode, "steer");
  const reopened = requiredEvent(events, "open", "completed").payload;
  assert.deepEqual(reopened.messages.map(({ role, text, toolName, status }) => ({ role, text, toolName, status })), [
    { role: "user", text: "hi", toolName: undefined, status: undefined },
    { role: "tool", text: undefined, toolName: "read", status: "completed" },
    { role: "assistant", text: "hello", toolName: undefined, status: undefined },
  ]);
  assert.equal(reopened.messages.at(-1)?.phase, "final_answer");
  assert.equal(reopened.runs.length, 1);
  assert.equal(reopened.runs[0]?.outcome, "stopped");
  assert.equal(requiredEvent(events, "recover", "completed").payload.runStatus, "idle");
  assert.equal(requiredEvent(events, "watch", "messageDelta").payload.delta, "live");
});

test("manual thread name wins a delayed one-shot generated title", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const events: WireEvent[] = [];
  let name: string | undefined;
  let resolveTitle: (value: string | undefined) => void = () => {};
  let generated = 0;
  let generatedFor: unknown;
  const session = {
    sessionId: "thread-name",
    sessionFile: "/tmp/thread-name.jsonl",
    messages: [],
    get sessionName() { return name; },
    setSessionName(value: string) { name = value; },
    subscribe() { return () => {}; },
    dispose() {},
  };
  serve(
    input,
    output,
    asCreateSession(async () => ({ session })),
    asResolveModel(() => ({ authStorage: {}, modelRegistry: {}, model: {} })),
    asListSessions(async () => [{ id: "thread-name", path: "/tmp/thread-name.jsonl", ...(name === undefined ? {} : { name }) }]),
    asGenerateTitle((source: unknown) => { generatedFor = source; generated += 1; return new Promise<string | undefined>((resolve) => { resolveTitle = resolve; }); }),
  );
  output.on("data", (chunk) => events.push(...parseWireEvents(chunk)));
  const send = (requestId: string, operation: string, payload: Record<string, unknown>) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);

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
  assert.equal(generatedFor, session);
  assert.equal(requiredEvent(events, "auto-name", "completed").payload.applied, false);
  assert.equal(events.filter(({ requestId, type }) => requestId === "auto-name" && type === "started").length, 1);
  assert.equal(requiredEvent(events, "reopen-list", "completed").payload[0]?.title, "Manual title wins");
});

test("tree navigation keeps source history and fork creates a distinct session", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-ocarina-tree-"));
  const sourceFile = join(cwd, "source.jsonl");
  const forkFile = join(cwd, "fork.jsonl");
  await writeFile(sourceFile, `${JSON.stringify({ type: "session", version: 3, id: "source", timestamp: "2026-01-01T00:00:00.000Z", cwd })}\n`);
  await writeFile(forkFile, `${JSON.stringify({ type: "session", version: 3, id: "fork", timestamp: "2026-01-01T00:00:00.000Z", cwd })}\n`);
  const entries = new Map([
    ["user", { id: "user", parentId: null, type: "message", message: { role: "user", content: "question" } }],
    ["assistant", { id: "assistant", parentId: "user", type: "message", message: { role: "assistant", content: "answer" } }],
  ]);
  let navigated;
  const source = {
    sessionId: "source", sessionFile: sourceFile, messages: [], isStreaming: false,
    sessionManager: {
      getLeafId: () => "assistant", getEntry: (id: string) => entries.get(id),
      getTree: () => [{ entry: entries.get("user"), children: [{ entry: entries.get("assistant"), children: [] }] }],
      createBranchedSession: () => forkFile,
    },
    navigateTree: async (id: string, options: { summarize: boolean }) => { navigated = { id, options }; return { cancelled: false }; },
    abortBranchSummary() {}, getAvailableThinkingLevels: () => ["off"], dispose() {},
  };
  const forked = { ...source, sessionId: "fork", sessionFile: forkFile, sessionManager: { ...source.sessionManager, getLeafId: () => "assistant" } };
  let created = 0;
  const input = new PassThrough(); const output = new PassThrough(); const events: WireEvent[] = [];
  serve(input, output, asCreateSession(async () => ({ session: created++ === 0 ? source : forked })), asResolveModel(() => ({ authStorage: {}, modelRegistry: {}, model: {} })));
  output.on("data", (chunk) => events.push(...parseWireEvents(chunk)));
  const send = (requestId: string, operation: string, payload: Record<string, unknown>) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);
  send("create-tree", "createThread", { cwd, provider: "test", modelId: "test" }); await new Promise((resolve) => setTimeout(resolve, 5));
  send("tree", "getThreadTree", { threadId: "source" });
  send("navigate", "navigateThread", { threadId: "source", entryId: "user", summarize: true });
  send("fork", "forkThread", { threadId: "source", entryId: "assistant", cwd });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requiredEvent(events, "tree", "completed").payload.nodes[0]?.children[0]?.preview, "answer");
  assert.deepEqual(navigated, { id: "user", options: { summarize: true } });
  assert.equal(requiredEvent(events, "fork", "completed").payload.threadId, "fork");
  assert.equal(source.sessionId, "source");
  await rm(cwd, { recursive: true, force: true });
});

test("real provider creates a persistent thread and answers", { skip: process.env.PI_OCARINA_REAL_PROVIDER !== "1" }, async () => {
  const [provider, modelId] = (process.env.PI_OCARINA_REAL_MODEL ?? "").split("/");
  assert.ok(provider && modelId, "set PI_OCARINA_REAL_MODEL=provider/model");
  const cwd = await mkdtemp(join(tmpdir(), "pi-ocarina-real-"));
  const input = new PassThrough();
  const output = new PassThrough();
  const events: WireEvent[] = [];
  serve(input, output);
  output.on("data", (chunk) => events.push(...parseWireEvents(chunk)));
  const send = (requestId: string, operation: string, payload: Record<string, unknown>) => input.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`);
  const terminal = (requestId: string) => new Promise<WireEvent>((resolve) => {
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
