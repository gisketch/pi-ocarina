import { createInterface } from "node:readline";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync, unwatchFile, watchFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import {
  AgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  CURRENT_SESSION_VERSION,
  createAgentSession,
  discoverAndLoadExtensions,
  getAgentDir,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
  type CreateAgentSessionResult,
  type ExtensionUIContext,
  type ResolvedCommand,
  type SessionInfo,
} from "@mariozechner/pi-coding-agent";
import { acquireLease, sessionSchema, shouldRefreshFromDisk } from "./session-coexistence.js";
import { OrchestrationRuntime } from "./orchestration.js";

export const PROTOCOL_VERSION = 1;

type CreateSession = (options?: CreateAgentSessionOptions) => Promise<CreateAgentSessionResult>;
type ResolvedModel = {
  authStorage: ReturnType<typeof AuthStorage.create>;
  modelRegistry: ReturnType<typeof ModelRegistry.create>;
  model: NonNullable<AgentSession["model"]>;
};
type ResolveModel = (payload: ModelPayload) => ResolvedModel;
type ListSessions = (cwd: string) => Promise<SessionInfo[]>;
type GenerateTitle = (prompt: string, signal: AbortSignal) => Promise<string | undefined>;
type SessionMap = Map<string, AgentSession>;
type LeaseMap = Map<string, string>;
type BaselineMap = Map<string, number>;
type Publish = (type: string, payload: Record<string, unknown>) => void;
type ToolPublishPayload = { threadId: string; toolCallId?: string; toolName?: string; status: "preparing" | "running" | "completed" | "failed"; input?: unknown; output?: unknown };
type PendingToolPublish = { payload: ToolPublishPayload; timer: ReturnType<typeof setTimeout> };
type PromptPending = { threadId: string; resolve: (value: unknown) => void };
type PromptMap = Map<string, PromptPending>;
type Attachment = { path: string; name: string; size?: number; kind?: string };
type QueueItem = { id?: string; mode: "steer" | "followUp"; prompt: string; attachments: Attachment[] };
type QueueMap = Map<string, QueueItem[]>;
type ModelPayload = { provider: string; modelId: string; agentDir?: string };
type ThreadPayload = { threadId: string };
type OpenThreadPayload = { cwd: string; sessionFile: string; agentDir?: string };
type RecoverThreadPayload = OpenThreadPayload & { threadId: string };
type CreateThreadPayload = ModelPayload & { cwd: string; thinkingLevel?: CreateAgentSessionOptions["thinkingLevel"] };

const AttachmentSchema = Type.Object({
  path: Type.String(),
  name: Type.String(),
  size: Type.Optional(Type.Number()),
  kind: Type.Optional(Type.String()),
});
const QueueItemSchema = Type.Object({
  id: Type.Optional(Type.String()),
  mode: Type.Union([Type.Literal("steer"), Type.Literal("followUp")]),
  prompt: Type.String(),
  attachments: Type.Array(AttachmentSchema),
});
const AgentDirSchema = { agentDir: Type.Optional(Type.String()) };
const ThreadSchema = Type.Object({ threadId: Type.String({ minLength: 1 }) });
const ModelSchema = Type.Object({ provider: Type.String(), modelId: Type.String(), ...AgentDirSchema });
const OpenThreadSchema = Type.Object({ cwd: Type.String(), sessionFile: Type.String(), ...AgentDirSchema });
const RecoverThreadSchema = Type.Object({ cwd: Type.String(), sessionFile: Type.String(), threadId: Type.String(), ...AgentDirSchema });
const ThinkingLevelSchema = Type.Union([
  Type.Literal("off"), Type.Literal("minimal"), Type.Literal("low"),
  Type.Literal("medium"), Type.Literal("high"), Type.Literal("xhigh"),
]);
const CreateThreadSchema = Type.Object({ cwd: Type.String(), provider: Type.String(), modelId: Type.String(), thinkingLevel: Type.Optional(ThinkingLevelSchema), ...AgentDirSchema });

function validated<T extends TSchema>(operation: string, schema: T, payload: unknown): Static<T> {
  if (!Value.Check(schema, payload)) throw new Error(`Invalid payload for ${operation}`);
  return payload as Static<T>;
}

function agentDirOption(agentDir: string | undefined) {
  return agentDir === undefined ? {} : { agentDir };
}

const HostRequestSchema = Type.Object({
  version: Type.Literal(PROTOCOL_VERSION),
  requestId: Type.String({ minLength: 1 }),
  operation: Type.String({ minLength: 1 }),
  payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
}, { additionalProperties: false });
type HostRequest = Static<typeof HostRequestSchema>;

export async function inspectRuntime({ cwd = process.cwd(), extensionPaths = [] }: { cwd?: string; extensionPaths?: string[] } = {}) {
  const authStorage = AuthStorage.create();
  const models = ModelRegistry.create(authStorage).getAvailable();
  const extensions = await discoverAndLoadExtensions(extensionPaths, cwd);

  return {
    node: process.versions.node,
    models: models.length,
    extensions: extensions.extensions.map(({ path }) => path),
    errors: extensions.errors.map(({ error }) => error),
  };
}

export function serve(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout, createSession: CreateSession = createAgentSession, resolveModel: ResolveModel = resolveSelectedModel, listSessions: ListSessions = SessionManager.list, generateTitle: GenerateTitle = generateThreadTitle) {
  const active = new Map<string, AbortController>();
  const sessions: SessionMap = new Map();
  const runningThreads = new Set<string>();
  const prompts: PromptMap = new Map();
  const threadQueues: QueueMap = new Map();
  const leases: LeaseMap = new Map();
  const baselines: BaselineMap = new Map();
  const orchestration = new OrchestrationRuntime(join(getAgentDir(), "orchestration.json"));
  orchestration.setHandler(async (parent, action, payload) => {
    if (action === "list") return orchestration.list(parent);
    if (action === "create") {
      const context = orchestration.contexts.get(parent);
      const createPayload = validated("child create", CreateThreadSchema, context);
      const child = await createThread(createPayload, createSession, resolveModel, sessions, leases, baselines, orchestration);
      orchestration.link(parent, child.threadId);
      if (!payload.prompt) return { ...child, status: "waiting" };
      orchestration.setStatus(child.threadId, "running");
      try { const value = await promptThread({ threadId: child.threadId, prompt: payload.prompt }, new AbortController().signal, sessions, runningThreads, prompts, threadQueues, () => {}, orchestration); orchestration.setStatus(child.threadId, "completed"); return { ...value, status: "completed" }; }
      catch (error) { orchestration.setStatus(child.threadId, "failed"); throw error; }
    }
    const childPayload = validated("child action", Type.Object({
      threadId: Type.String(),
      prompt: Type.Optional(Type.String()),
      evidence: Type.Optional(Type.String()),
      evidenceType: Type.Optional(Type.String()),
      gate: Type.Optional(Type.String()),
    }), payload);
    const session = sessions.get(childPayload.threadId);
    if (!session) throw new Error("Child thread is not open");
    if (action === "read") return { ...threadSnapshot(session), messages: threadSnapshot(session).messages.slice(-20), status: orchestration.status.get(childPayload.threadId) };
    if (action === "supervise") { if (childPayload.evidence) orchestration.supervision.evidence(childPayload.threadId, childPayload.evidenceType ?? "report", childPayload.evidence); return childPayload.gate ? orchestration.supervision.gate(childPayload.threadId, childPayload.gate) : orchestration.supervision.get(childPayload.threadId); }
    if (action === "cancel") { await session.abort(); orchestration.setStatus(childPayload.threadId, "canceled"); return { threadId: childPayload.threadId, status: "canceled" }; }
    if (action === "message") {
      if (!childPayload.prompt) throw new Error("Child prompt is required");
      if (runningThreads.has(childPayload.threadId)) { await queueThread({ threadId: childPayload.threadId, prompt: childPayload.prompt, mode: "followUp" }, sessions, runningThreads, threadQueues); return { threadId: childPayload.threadId, status: "queued" }; }
      orchestration.setStatus(childPayload.threadId, "running");
      try { const value = await promptThread({ threadId: childPayload.threadId, prompt: childPayload.prompt }, new AbortController().signal, sessions, runningThreads, prompts, threadQueues, () => {}, orchestration); orchestration.setStatus(childPayload.threadId, "completed"); return { ...value, status: "completed" }; }
      catch (error) { orchestration.setStatus(childPayload.threadId, "failed"); throw error; }
    }
    throw new Error("Unsupported child action");
  });
  const heartbeat = setInterval(() => {
    for (const sessionFile of leases.keys()) void acquireLease(sessionFile).catch(() => {});
  }, 60_000).unref();
  input.once("close", () => {
    clearInterval(heartbeat);
    if (input !== process.stdin) return;
    for (const session of sessions.values()) session.dispose();
    void Promise.all([...leases.values()].map((path) => rm(path, { force: true })))
      .finally(() => process.exit(0));
  });
  const send = (requestId: string, type: string, payload: unknown = {}) =>
    output.write(`${JSON.stringify({ version: PROTOCOL_VERSION, requestId, type, payload })}\n`);

  const run = async (request: HostRequest) => {
    const { version, requestId, operation, payload = {} } = request;
    if (version !== PROTOCOL_VERSION || typeof requestId !== "string" || !requestId || typeof operation !== "string") {
      throw new Error("Invalid protocol request");
    }
    if (operation === "cancel") {
      const cancelPayload = validated(operation, Type.Object({ requestId: Type.String() }), payload);
      const target = active.get(cancelPayload.requestId);
      if (!target) throw new Error(`Request is not active: ${cancelPayload.requestId}`);
      target.abort();
      send(requestId, "completed", { cancelled: cancelPayload.requestId });
      return;
    }
    if (operation === "resolveRuntimePrompt") {
      const promptPayload = validated(operation, Type.Object({ promptId: Type.String(), threadId: Type.String(), cancelled: Type.Optional(Type.Boolean()), value: Type.Optional(Type.Unknown()) }), payload);
      const pending = prompts.get(promptPayload.promptId);
      if (!pending || pending.threadId !== promptPayload.threadId) throw new Error("Runtime prompt is no longer active");
      prompts.delete(promptPayload.promptId);
      pending.resolve(promptPayload.cancelled ? undefined : promptPayload.value);
      send(requestId, "completed", { resolved: promptPayload.promptId });
      return;
    }
    if (active.has(requestId)) throw new Error(`Request is already active: ${requestId}`);

    const controller = new AbortController();
    active.set(requestId, controller);
    send(requestId, "started");
    try {
      let result;
      if (operation === "inspectRuntime") result = await inspectRuntime(validated(operation, Type.Object({ cwd: Type.Optional(Type.String()), extensionPaths: Type.Optional(Type.Array(Type.String())) }), payload));
      else if (operation === "createSession") result = await provePiSession(payload, createSession);
      else if (operation === "createThread") result = await createThread(validated(operation, CreateThreadSchema, payload), createSession, resolveModel, sessions, leases, baselines, orchestration);
      else if (operation === "listThreads") result = await listThreads(validated(operation, Type.Object({ cwd: Type.String() }), payload), listSessions);
      else if (operation === "openThread") result = await openThread(validated(operation, OpenThreadSchema, payload), createSession, listSessions, sessions, leases, baselines);
      else if (operation === "recoverThread") result = await recoverThread(validated(operation, RecoverThreadSchema, payload), createSession, listSessions, sessions, runningThreads, leases, baselines);
      else if (operation === "refreshThread") result = await refreshThread(validated(operation, RecoverThreadSchema, payload), createSession, listSessions, sessions, runningThreads, leases, baselines);
      else if (operation === "watchThread") result = await watchThread(validated(operation, ThreadSchema, payload), controller.signal, sessions, (type, event) => send(requestId, type, event));
      else if (operation === "promptThread") result = await promptThread(validated(operation, Type.Object({ threadId: Type.String(), prompt: Type.Optional(Type.String()), attachments: Type.Optional(Type.Array(AttachmentSchema)) }), payload), controller.signal, sessions, runningThreads, prompts, threadQueues, (type, event) => send(requestId, type, event), orchestration);
      else if (operation === "queueThread") result = await queueThread(validated(operation, Type.Object({ threadId: Type.String(), prompt: Type.Optional(Type.String()), attachments: Type.Optional(Type.Array(AttachmentSchema)), mode: Type.Optional(Type.Union([Type.Literal("steer"), Type.Literal("followUp")])) }), payload), sessions, runningThreads, threadQueues);
      else if (operation === "replaceThreadQueue") result = await replaceThreadQueue(validated(operation, Type.Object({ threadId: Type.String(), items: Type.Optional(Type.Array(QueueItemSchema)) }), payload), sessions, runningThreads, threadQueues);
      else if (operation === "threadQueue") result = { items: threadQueues.get(validated(operation, ThreadSchema, payload).threadId) ?? [] };
      else if (operation === "setThreadModel") result = await setThreadModel(validated(operation, Type.Intersect([ThreadSchema, ModelSchema]), payload), sessions, resolveModel);
      else if (operation === "setThreadThinking") result = setThreadThinking(validated(operation, Type.Object({ threadId: Type.String(), thinkingLevel: Type.String() }), payload), sessions);
      else if (operation === "generateThreadTitle") result = await autoNameThread(validated(operation, Type.Object({ threadId: Type.String(), prompt: Type.String() }), payload), sessions, generateTitle, controller.signal);
      else if (operation === "renameThread") result = renameThread(validated(operation, Type.Object({ threadId: Type.String(), title: Type.String() }), payload), sessions);
      else if (operation === "reloadResources") result = await reloadResources(validated(operation, ThreadSchema, payload), sessions);
      else if (operation === "setExtensionEnabled") result = await setExtensionEnabled(validated(operation, Type.Object({ threadId: Type.String(), source: Type.String(), enabled: Type.Boolean() }), payload), sessions);
      else if (operation === "getThreadTree") result = getThreadTree(validated(operation, ThreadSchema, payload), sessions);
      else if (operation === "forkThread") result = await forkThread(validated(operation, Type.Object({ threadId: Type.String(), entryId: Type.String(), cwd: Type.String(), ...AgentDirSchema }), payload), createSession, sessions, leases, baselines);
      else if (operation === "navigateThread") result = await navigateThread(validated(operation, Type.Object({ threadId: Type.String(), entryId: Type.String(), summarize: Type.Optional(Type.Boolean()) }), payload), controller.signal, sessions);
      else if (operation === "prompt") result = await promptPi(validated(operation, Type.Object({ prompt: Type.String(), cwd: Type.Optional(Type.String()), ...AgentDirSchema }), payload), controller.signal, createSession);
      else if (operation === "watchCatalog") result = await watchCatalog(validated(operation, Type.Object(AgentDirSchema), payload), controller.signal, (catalog) => send(requestId, "catalog", catalog));
      else if (operation === "saveProviderCredential") result = saveProviderCredential(payload);
      else if (operation === "saveCustomEndpoint") result = await saveCustomEndpoint(payload);
      else if (operation === "deleteCustomEndpoint") result = await deleteCustomEndpoint(payload);
      else if (operation === "wait") result = await wait(validated(operation, Type.Object({ ms: Type.Optional(Type.Number()) }), payload).ms, controller.signal);
      else throw new Error(`Unsupported operation: ${operation}`);
      if (controller.signal.aborted) throw new Error("Cancelled");
      send(requestId, "completed", result);
    } catch (error) {
      send(requestId, controller.signal.aborted ? "cancelled" : "failed", {
        message: safeError(error),
      });
    } finally {
      active.delete(requestId);
    }
  };

  createInterface({ input }).on("line", (line) => {
    if (!line.trim()) return;
    try {
      const request: unknown = JSON.parse(line);
      if (!Value.Check(HostRequestSchema, request)) throw new Error("Invalid protocol request");
      void run(request).catch((error) => send(request.requestId, "failed", { message: safeError(error) }));
    } catch {
      send("unknown", "failed", { message: "Malformed JSON request" });
    }
  });
}

async function autoNameThread({ threadId, prompt }: { threadId: string; prompt: string }, sessions: SessionMap, generateTitle: GenerateTitle, signal: AbortSignal) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  if (session.sessionName) return { threadId, title: session.sessionName, applied: false };
  const title = normalizeTitle(await generateTitle(prompt, signal));
  if (!title || signal.aborted || session.sessionName) return { threadId, title: session.sessionName, applied: false };
  session.setSessionName(title);
  return { threadId, title, applied: true };
}

function renameThread({ threadId, title }: { threadId: string; title: string }, sessions: SessionMap) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  const normalized = normalizeTitle(title);
  if (!normalized) throw new Error("Thread name is required");
  session.setSessionName(normalized);
  return { threadId, title: normalized };
}

function getThreadTree({ threadId }: ThreadPayload, sessions: SessionMap) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  type TreeNode = ReturnType<SessionManager["getTree"]>[number];
  const compact = ({ entry, children, label }: TreeNode): Record<string, unknown> => ({
    entryId: entry.id,
    parentId: entry.parentId,
    type: entry.type,
    role: entry.type === "message" ? entry.message.role : undefined,
    preview: boundedPreview(entry.type === "message"
      ? messageText("content" in entry.message ? entry.message.content : "")
      : ("summary" in entry ? entry.summary : undefined) ?? label ?? entry.type),
    active: entry.id === session.sessionManager.getLeafId(),
    children: children.map(compact),
  });
  return { threadId, nodes: session.sessionManager.getTree().map(compact) };
}

async function forkThread({ threadId, entryId, cwd, agentDir }: { threadId: string; entryId: string; cwd: string; agentDir?: string }, createSession: CreateSession, sessions: SessionMap, leases: LeaseMap, baselines: BaselineMap) {
  const source = sessions.get(threadId);
  if (!source) throw new Error("Thread is not open");
  if (typeof entryId !== "string" || !entryId) throw new Error("Fork entry is required");
  if (source.isStreaming) throw new Error("Session is already active");
  const path = source.sessionManager.createBranchedSession(entryId);
  if (!path) throw new Error("Fork requires a persistent Pi session");
  const { session } = await createSession({ cwd, ...agentDirOption(agentDir), sessionManager: SessionManager.open(path) });
  sessions.set(session.sessionId, session);
  try { leases.set(path, await acquireLease(path)); }
  catch (error) { sessions.delete(session.sessionId); session.dispose(); throw error; }
  const mtime = await fileMtime(path);
  if (mtime !== undefined) baselines.set(path, mtime);
  return withSchema(threadSnapshot(session));
}

async function navigateThread({ threadId, entryId, summarize = false }: { threadId: string; entryId: string; summarize?: boolean }, signal: AbortSignal, sessions: SessionMap) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  if (session.isStreaming) throw new Error("Session is already active");
  const abort = () => session.abortBranchSummary();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await session.navigateTree(entryId, { summarize: Boolean(summarize) });
    if (result.cancelled) throw new Error("Cancelled");
    return { ...(await withSchema(threadSnapshot(session))), editorText: result.editorText };
  } finally { signal.removeEventListener("abort", abort); }
}

function boundedPreview(value: unknown) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

async function generateThreadTitle(prompt: string, signal: AbortSignal) {
  if (signal.aborted || typeof prompt !== "string") return undefined;
  return prompt.trim().split(/\s+/).slice(0, 5).join(" ");
}

function normalizeTitle(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.trim().replace(/\s+/g, " ").replace(/[.!?,;:]+$/u, "").slice(0, 60).trim() || undefined;
}

async function createThread({ cwd, provider, modelId, thinkingLevel, agentDir }: CreateThreadPayload, createSession: CreateSession, resolveModel: ResolveModel, sessions: SessionMap, leases: LeaseMap, baselines: BaselineMap, orchestration?: OrchestrationRuntime) {
  if (typeof cwd !== "string" || !cwd) throw new Error("Workspace is required");
  const { authStorage, modelRegistry, model } = resolveModel({ provider, modelId, ...agentDirOption(agentDir) });
  const parent = { current: "" };
  const { session } = await createSession({
    cwd,
    ...agentDirOption(agentDir),
    authStorage,
    modelRegistry,
    model,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(orchestration ? { customTools: orchestration.tools(parent) } : {}),
    sessionManager: SessionManager.create(cwd),
  });
  parent.current = session.sessionId;
  orchestration?.contexts.set(session.sessionId, {
    cwd,
    provider,
    modelId,
    ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
    ...agentDirOption(agentDir),
  });
  sessions.set(session.sessionId, session);
  if (session.sessionFile) {
    try { leases.set(session.sessionFile, await acquireLease(session.sessionFile)); }
    catch (error) { sessions.delete(session.sessionId); session.dispose(); throw error; }
    const mtime = await fileMtime(session.sessionFile);
    if (mtime !== undefined) baselines.set(session.sessionFile, mtime);
  }
  return withSchema(threadSnapshot(session));
}

async function setThreadModel({ threadId, provider, modelId, agentDir }: ThreadPayload & ModelPayload, sessions: SessionMap, resolveModel: ResolveModel) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  const { model } = resolveModel({ provider, modelId, ...agentDirOption(agentDir) });
  await session.setModel(model);
  return threadSnapshot(session);
}

function setThreadThinking({ threadId, thinkingLevel }: ThreadPayload & { thinkingLevel: string }, sessions: SessionMap) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  const level = session.getAvailableThinkingLevels().find((candidate) => candidate === thinkingLevel);
  if (!level) throw new Error("Thinking level is unavailable for this model");
  session.setThinkingLevel(level);
  return threadSnapshot(session);
}

async function listThreads({ cwd }: { cwd: string }, listSessions: ListSessions) {
  if (typeof cwd !== "string" || !cwd) throw new Error("Workspace is required");
  return (await listSessions(cwd)).map(({ id, path, name, firstMessage, modified, messageCount }) => ({
    threadId: id,
    sessionFile: path,
    title: name || firstMessage || "Empty thread",
    modified: modified instanceof Date ? modified.toISOString() : modified,
    messageCount,
  }));
}

function resolveSelectedModel({ provider, modelId, agentDir }: ModelPayload) {
  if (typeof provider !== "string" || !provider || typeof modelId !== "string" || !modelId) {
    throw new Error("Model is required");
  }
  const authStorage = agentDir ? AuthStorage.create(join(agentDir, "auth.json")) : AuthStorage.create();
  const modelRegistry = agentDir
    ? ModelRegistry.create(authStorage, join(agentDir, "models.json"))
    : ModelRegistry.create(authStorage);
  const model = modelRegistry.find(provider, modelId);
  if (!model || !modelRegistry.hasConfiguredAuth(model)) throw new Error("Selected model is unavailable");
  return { authStorage, modelRegistry, model };
}

async function openThread({ cwd, sessionFile, agentDir }: OpenThreadPayload, createSession: CreateSession, listSessions: ListSessions, sessions: SessionMap, leases?: LeaseMap, baselines?: BaselineMap) {
  if (typeof cwd !== "string" || !cwd || typeof sessionFile !== "string" || !sessionFile) {
    throw new Error("Workspace and session file are required");
  }
  const available = await listSessions(cwd);
  if (!available.some(({ path }) => path === sessionFile)) throw new Error("Session does not belong to this workspace");
  const existing = [...sessions.values()].find((session) => session.sessionFile === sessionFile);
  if (existing) return withSchema(threadSnapshot(existing));
  if (leases && !leases.has(sessionFile)) leases.set(sessionFile, await acquireLease(sessionFile));
  const { session } = await createSession({ cwd, ...agentDirOption(agentDir), sessionManager: SessionManager.open(sessionFile) });
  sessions.set(session.sessionId, session);
  const mtime = await fileMtime(sessionFile);
  if (mtime !== undefined) baselines?.set(sessionFile, mtime);
  return withSchema(threadSnapshot(session));
}

async function recoverThread({ cwd, threadId, sessionFile, agentDir }: RecoverThreadPayload, createSession: CreateSession, listSessions: ListSessions, sessions: SessionMap, runningThreads: Set<string>, leases: LeaseMap, baselines: BaselineMap) {
  const existing = sessions.get(threadId);
  if (existing) return { ...(await withSchema(threadSnapshot(existing))), runStatus: runningThreads.has(threadId) ? "running" : "idle" };
  try {
    return { ...(await openThread({ cwd, sessionFile, ...agentDirOption(agentDir) }, createSession, listSessions, sessions, leases, baselines)), runStatus: "interrupted" };
  } catch (error) {
    if (/active/i.test(error instanceof Error ? error.message : String(error))) throw error;
    return { threadId, sessionFile, messages: [], runStatus: "missing" };
  }
}

async function refreshThread(payload: RecoverThreadPayload, createSession: CreateSession, listSessions: ListSessions, sessions: SessionMap, runningThreads: Set<string>, leases: LeaseMap, baselines: BaselineMap) {
  if (runningThreads.has(payload.threadId)) {
    const running = sessions.get(payload.threadId);
    if (!running) throw new Error("Thread is not open");
    return { ...(await withSchema(threadSnapshot(running))), runStatus: "running" };
  }
  const previous = sessions.get(payload.threadId);
  if (!previous) return { ...(await openThread(payload, createSession, listSessions, sessions, leases, baselines)), runStatus: "idle" };
  const diskMtime = await fileMtime(payload.sessionFile);
  const baseline = baselines.get(payload.sessionFile);
  if (!shouldRefreshFromDisk(diskMtime, baseline, false)) {
    if (baseline === undefined && diskMtime !== undefined) baselines.set(payload.sessionFile, diskMtime);
    return { ...(await withSchema(threadSnapshot(previous))), runStatus: "idle" };
  }
  previous?.dispose();
  sessions.delete(payload.threadId);
  return { ...(await openThread(payload, createSession, listSessions, sessions, leases, baselines)), runStatus: "idle" };
}

async function fileMtime(path: string) {
  try { return (await stat(path)).mtimeMs; } catch { return undefined; }
}

async function promptThread({ threadId, prompt = "", attachments = [] }: ThreadPayload & { prompt?: string; attachments?: Attachment[] }, signal: AbortSignal, sessions: SessionMap, runningThreads: Set<string>, prompts: PromptMap, queues: QueueMap, publish: Publish, orchestration?: OrchestrationRuntime) {
  if ((typeof prompt !== "string") || (!prompt.trim() && !attachments.length)) throw new Error("Prompt is required");
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  if (runningThreads.has(threadId)) throw new Error("Session is already active");
  const sessionFile = session.sessionFile;
  if (!sessionFile) throw new Error("Persistent session is required");
  if ((await sessionSchema(sessionFile, CURRENT_SESSION_VERSION)).newer) throw new Error("Session was written by a newer Pi version and is read-only");
  const unsubscribe = session.subscribe((event) => publishPiEvent(event, threadId, publish));
  const abort = () => { void session.abort(); void orchestration?.cancelChildren(threadId); cancelThreadPrompts(threadId, prompts); };
  const commandName = prompt.trim().match(/^\/([^\s]+)/)?.[1];
  const command = session.extensionRunner?.getRegisteredCommands?.().find(({ invocationName }) => invocationName === commandName);
  session.extensionRunner?.setUIContext(runtimeUi(threadId, prompts, publish, command) as unknown as ExtensionUIContext);
  signal.addEventListener("abort", abort, { once: true });
  runningThreads.add(threadId);
  try {
    const prepared = await preparePrompt(prompt, attachments);
    await session.prompt(prepared.text, { images: prepared.images });
    if (session.sessionId !== threadId) {
      sessions.delete(threadId);
      sessions.set(session.sessionId, session);
      publish("sessionChanged", { ...threadSnapshot(session), previousThreadId: threadId });
    }
    return threadSnapshot(session);
  } finally {
    signal.removeEventListener("abort", abort);
    runningThreads.delete(threadId);
    queues.delete(threadId);
    cancelThreadPrompts(threadId, prompts);
    unsubscribe();
  }
}

async function queueThread({ threadId, prompt = "", attachments = [], mode = "followUp" }: ThreadPayload & { prompt?: string; attachments?: Attachment[]; mode?: "steer" | "followUp" }, sessions: SessionMap, runningThreads: Set<string>, queues: QueueMap) {
  const session = sessions.get(threadId);
  if (!session || !runningThreads.has(threadId)) throw new Error("Session is not active");
  if (!['steer', 'followUp'].includes(mode)) throw new Error("Invalid queue mode");
  const prepared = await preparePrompt(prompt, attachments);
  await session[mode](prepared.text, prepared.images);
  const item = { id: crypto.randomUUID(), mode, prompt, attachments };
  const items = [...(queues.get(threadId) ?? []), item];
  queues.set(threadId, items);
  return { items };
}

async function replaceThreadQueue({ threadId, items = [] }: ThreadPayload & { items?: QueueItem[] }, sessions: SessionMap, runningThreads: Set<string>, queues: QueueMap) {
  const session = sessions.get(threadId);
  if (!session || !runningThreads.has(threadId)) throw new Error("Session is not active");
  if (!Array.isArray(items)) throw new Error("Invalid queue");
  session.clearQueue();
  for (const item of items) {
    if (!item || !["steer", "followUp"].includes(item.mode)) throw new Error("Invalid queue mode");
    const prepared = await preparePrompt(item.prompt, item.attachments ?? []);
    await session[item.mode](prepared.text, prepared.images);
  }
  queues.set(threadId, items);
  return { items };
}

export async function preparePrompt(prompt: string, attachments: Attachment[]) {
  if (!Array.isArray(attachments) || attachments.length > 20) throw new Error("Invalid attachments");
  const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
  const files: string[] = [];
  for (const item of attachments) {
    if (!item || typeof item.path !== "string" || typeof item.name !== "string") throw new Error("Invalid attachment");
    const info = await stat(item.path);
    if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new Error("Invalid attachment");
    const extension = item.path.split(".").at(-1)?.toLowerCase();
    if (extension && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)) {
      const mimeType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
      images.push({ type: "image", data: (await readFile(item.path)).toString("base64"), mimeType });
    } else files.push(`Attached file available to tools: ${item.path}`);
  }
  return { text: [prompt.trim(), ...files].filter(Boolean).join("\n\n") || "Review the attached image.", images };
}

function watchThread({ threadId }: ThreadPayload, signal: AbortSignal, sessions: SessionMap, publish: Publish) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  return new Promise((resolve) => {
    const unsubscribe = session.subscribe((event) => publishPiEvent(event, threadId, publish));
    signal.addEventListener("abort", () => { unsubscribe(); resolve({ stopped: true }); }, { once: true });
  });
}

const pendingToolPublishes = new WeakMap<Publish, Map<string, PendingToolPublish>>();

function publishToolCall(publish: Publish, payload: ToolPublishPayload, deferred = false) {
  const key = payload.toolCallId;
  if (!deferred || !key) {
    flushToolCall(publish, key);
    publish("toolCall", payload);
    return;
  }
  const pending = pendingToolPublishes.get(publish) ?? new Map<string, PendingToolPublish>();
  pendingToolPublishes.set(publish, pending);
  const current = pending.get(key);
  if (current) {
    current.payload = { ...current.payload, ...payload, input: payload.input ?? current.payload.input };
    return;
  }
  const timer = setTimeout(() => flushToolCall(publish, key), 16);
  timer.unref();
  pending.set(key, { payload, timer });
}

function flushToolCall(publish: Publish, key?: string) {
  const pending = pendingToolPublishes.get(publish);
  if (!pending) return;
  const keys = key ? [key] : [...pending.keys()];
  for (const itemKey of keys) {
    const item = pending.get(itemKey);
    if (!item) continue;
    clearTimeout(item.timer);
    pending.delete(itemKey);
    publish("toolCall", item.payload);
  }
  if (pending.size === 0) pendingToolPublishes.delete(publish);
}

function partialToolCalls(message: unknown) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return [];
  const record = message as Record<string, unknown>;
  if (record.role !== "assistant" || !Array.isArray(record.content)) return [];
  return record.content.flatMap((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return [];
    const value = part as Record<string, unknown>;
    if (value.type !== "toolCall" || typeof value.id !== "string" || typeof value.name !== "string") return [];
    return [{ toolCallId: value.id, toolName: value.name, input: value.arguments }];
  });
}

function publishPiEvent(event: AgentSessionEvent, threadId: string, publish: Publish) {
  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") publish("messageDelta", { threadId, delta: event.assistantMessageEvent.delta });
    for (const tool of partialToolCalls(event.message)) publishToolCall(publish, { threadId, ...tool, status: "preparing" }, true);
    return;
  }
  if (event.type === "message_end") {
    flushToolCall(publish);
    const message = event.message as unknown;
    if (message && typeof message === "object" && !Array.isArray(message) && ["error", "aborted"].includes(String((message as Record<string, unknown>).stopReason))) {
      for (const tool of partialToolCalls(message)) publishToolCall(publish, { threadId, ...tool, status: "failed", output: (message as Record<string, unknown>).errorMessage ?? "Tool preparation interrupted" });
    }
    return;
  }
  if (event.type === "tool_execution_start") publishToolCall(publish, { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: "running", input: event.args });
  else if (event.type === "tool_execution_update") publishToolCall(publish, { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: "running", output: event.partialResult });
  else if (event.type === "tool_execution_end") publishToolCall(publish, { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: event.isError ? "failed" : "completed", output: event.result });
}

function cancelThreadPrompts(threadId: string, prompts: PromptMap) {
  for (const [id, pending] of prompts) if (pending.threadId === threadId) { prompts.delete(id); pending.resolve(undefined); }
}

function runtimeUi(threadId: string, prompts: PromptMap, publish: Publish, command?: ResolvedCommand) {
  const ask = (kind: "select" | "confirm" | "input" | "editor", title?: string, message?: string, options?: string[]): Promise<unknown> => new Promise((resolve) => {
    const promptId = crypto.randomUUID();
    prompts.set(promptId, { threadId, resolve });
    publish("runtimePrompt", { promptId, threadId, kind, title: boundedOptional(title, 4096), message: boundedOptional(message, 65_536), options: Array.isArray(options) ? options.slice(0, 100).map((value) => boundedText(value, 4096)).filter(Boolean) : undefined });
  });
  return {
    select: (title: string, options: string[]) => ask("select", title, undefined, options),
    confirm: async (title: string, message: string) => Boolean(await ask("confirm", title, message)),
    input: (title: string, placeholder?: string) => ask("input", title, placeholder),
    notify: (message: string, type: "info" | "warning" | "error" = "info") => publish("runtimeNotice", { threadId, message: boundedText(message, 65_536) || "Extension notification", type: ["info", "warning", "error"].includes(type) ? type : "info" }),
    onTerminalInput: () => () => {},
    setStatus: (key: string, value: string | undefined) => publish("extensionDock", { threadId, kind: "status", key: boundedText(key, 256), value: literalUi(value, "Status unavailable") }),
    setWorkingMessage() {}, setWorkingVisible() {}, setWorkingIndicator() {}, setHiddenThinkingLabel() {},
    setWidget: (key: string, value: unknown) => publish("extensionDock", { threadId, kind: "widget", key: boundedText(key, 256), value: literalUi(value, "Custom widget unavailable in desktop") }),
    setFooter() {}, setHeader() {},
    setTitle: (value: string) => publish("extensionDock", { threadId, kind: "title", value: literalUi(value, "") }),
    pasteToEditor: (text: string) => publish("editorText", { threadId, text: boundedText(text, 262_144), mode: "append" }),
    setEditorText: (text: string) => publish("editorText", { threadId, text: boundedText(text, 262_144), mode: "replace" }),
    getEditorText: () => "", editor: (title: string, prefill?: string) => ask("editor", title, prefill),
    custom: async () => {
      const capability = "custom";
      const message = `/${command?.invocationName ?? "extension command"} requires terminal-only custom UI and is not supported in Pi Ocarina. Use pi in the terminal for this command.`;
      publish("compatibilityIssue", { threadId, capability, message, commandName: command?.invocationName, extensionPath: command?.sourceInfo?.path ?? "unknown" });
      throw new Error(message);
    },
    setAutocompleteProvider() {},
  };
}

function literalUi(value: unknown, fallback: string) {
  if (value == null) return value;
  if (typeof value === "string") return boundedText(value, 65_536);
  if (Array.isArray(value) && value.every((line) => typeof line === "string")) return value.slice(0, 100).map((line) => boundedText(line, 4096));
  return fallback;
}

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function boundedOptional(value: unknown, max: number) {
  const text = boundedText(value, max);
  return text || undefined;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/required|unavailable|not open|cancelled|unsupported|validation|active|read-only/i.test(message)) return message;
  return "Agent run failed. Check provider settings and try again.";
}

function threadSnapshot(session: AgentSession) {
  const sessionFile = session.sessionFile;
  if (!sessionFile) throw new Error("Persistent session is required");
  const extensionCommands = session.extensionRunner?.getRegisteredCommands?.() ?? [];
  const skills = session.resourceLoader?.getSkills?.().skills ?? [];
  return {
    threadId: session.sessionId,
    sessionFile,
    title: session.sessionName,
    messages: transcriptMessages(session.messages),
    model: session.model ? { provider: session.model.provider, id: session.model.id, name: session.model.name } : null,
    thinkingLevel: session.thinkingLevel ?? "off",
    thinkingLevels: session.getAvailableThinkingLevels?.() ?? ["off"],
    commands: [
      ...extensionCommands.map(({ invocationName, description, sourceInfo }) => ({ name: invocationName, description, source: "extension", extensionPath: sourceInfo?.path ?? "unknown" })),
      ...(session.promptTemplates ?? []).map(({ name, description }) => ({ name, description, source: "prompt" })),
      ...skills.map(({ name, description }) => ({ name: `skill:${name}`, description, source: "skill" })),
    ],
    skills: skills.map(({ name, description, filePath, sourceInfo, disableModelInvocation }) => ({
      name, description, path: filePath, source: sourceInfo?.source ?? "unknown",
      scope: sourceInfo?.scope ?? "temporary", available: true,
      aliases: [`skill:${name}`], disableModelInvocation,
    })),
    extensions: extensionSnapshot(session),
  };
}

async function reloadResources({ threadId }: ThreadPayload, sessions: SessionMap) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  await session.reload();
  return threadSnapshot(session);
}

async function setExtensionEnabled({ threadId, source, enabled }: ThreadPayload & { source: string; enabled: boolean }, sessions: SessionMap) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  const record = extensionSnapshot(session).find((item) => item.source === source);
  if (!record?.managed) throw new Error("Extension is not managed by Pi settings");
  const settings = session.settingsManager;
  const scope = record.scope === "project" ? settings.getProjectSettings() : settings.getGlobalSettings();
  if (record.kind === "package") {
    const packages = (scope.packages ?? []).map((item) => packageSource(item) === source ? (enabled ? enablePackage(item) : { ...(typeof item === "object" ? item : { source }), extensions: [] }) : item);
    if (record.scope === "project") settings.setProjectPackages(packages);
    else settings.setPackages(packages);
  } else {
    const paths = (scope.extensions ?? []).map((item) => item.replace(/^!/, "") === source ? (enabled ? source : `!${source}`) : item);
    if (record.scope === "project") settings.setProjectExtensionPaths(paths);
    else settings.setExtensionPaths(paths);
  }
  await settings.flush();
  await session.reload();
  return threadSnapshot(session);
}

type PackageSetting = string | { source: string; extensions?: string[]; [key: string]: unknown };
function packageSource(item: PackageSetting) { return typeof item === "string" ? item : item.source; }
function enablePackage(item: PackageSetting): PackageSetting {
  if (typeof item === "string") return item;
  const enabled = { ...item };
  delete enabled.extensions;
  return enabled;
}

function extensionSnapshot(session: AgentSession) {
  const settings = session.settingsManager;
  if (!settings) return (session.resourceLoader?.getExtensions?.().extensions ?? []).map(extensionRecord);
  type ExtensionRecord = { source: string; label?: string; path?: string; scope: string; kind: string; enabled: boolean; managed: boolean };
  const configured: ExtensionRecord[] = [];
  const scopes = [
    { name: "user", settings: settings.getGlobalSettings() },
    { name: "project", settings: settings.getProjectSettings() },
  ];
  for (const { name, settings: scope } of scopes) {
    for (const item of scope.packages ?? []) configured.push({ source: packageSource(item), scope: name, kind: "package", enabled: typeof item === "string" || item.extensions?.length !== 0, managed: true });
    for (const item of scope.extensions ?? []) configured.push({ source: item.replace(/^!/, ""), scope: name, kind: "path", enabled: !item.startsWith("!"), managed: true });
  }
  const records = new Map(configured.map((item) => [item.source, { ...item, label: extensionLabel(item.source) }]));
  for (const item of (session.resourceLoader?.getExtensions?.().extensions ?? []).map(extensionRecord)) records.set(item.source, { ...records.get(item.source), ...item, enabled: true, managed: records.get(item.source)?.managed ?? false });
  return [...records.values()];
}

function extensionRecord(extension: { path: string; sourceInfo?: { source?: string; scope?: string; origin?: string } }) {
  const source = extension.sourceInfo?.source ?? extension.path;
  return { source, label: extensionLabel(source), path: extension.path, scope: extension.sourceInfo?.scope ?? "temporary", kind: extension.sourceInfo?.origin === "package" ? "package" : "path", enabled: true, managed: false };
}

function extensionLabel(source: string) {
  if (source.startsWith("npm:")) return extensionLabel(source.slice(4));
  if (source.startsWith("git:")) return source.replace(/^git:/, "").replace(/\.git(?:#.*)?$/, "").split("/").slice(-2).join("/");
  if (source.startsWith("@")) return source.split("@").slice(0, 2).join("@");
  if (!source.includes("/") || source.startsWith("npm:")) return source.replace(/^npm:/, "").split("@")[0] ?? source;
  return source.replace(/#.*$/, "").replace(/\.git$/, "").replace(/\/$/, "").split("/").pop() ?? source;
}

async function withSchema<T extends { sessionFile: string }>(snapshot: T) {
  return { ...snapshot, schema: await sessionSchema(snapshot.sessionFile, CURRENT_SESSION_VERSION) };
}

type TranscriptItem = { role: string; text?: string; toolCallId?: string; toolName?: string; status?: string; input?: unknown; output?: unknown };
function transcriptMessages(messages: readonly unknown[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const tools = new Map<string, number>();
  for (const message of messages) {
    if (!message || typeof message !== "object" || !("role" in message) || !("content" in message)) continue;
    const value = message as Record<string, unknown>;
    const messageItems = value.role === "toolResult" && typeof value.toolCallId === "string" && typeof value.toolName === "string"
      ? [{ role: "tool", toolCallId: value.toolCallId, toolName: value.toolName, status: value.isError ? "failed" : "completed", output: value.content }]
      : transcriptItems(String(value.role), value.content);
    for (const item of messageItems) {
      const index = item.toolCallId ? tools.get(item.toolCallId) ?? -1 : -1;
      if (index < 0) {
        if (item.toolCallId) tools.set(item.toolCallId, items.length);
        items.push(item);
      }
      else items[index] = { ...items[index], ...item, input: item.input ?? items[index]?.input, output: item.output ?? items[index]?.output };
    }
  }
  return items;
}

function transcriptItems(role: string, content: unknown): TranscriptItem[] {
  const text = messageText(content);
  const items: TranscriptItem[] = text ? [{ role, text }] : [];
  if (!Array.isArray(content)) return items;
  for (const part of content) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const value = part as Record<string, unknown>;
    if (value.type === "toolCall") items.push({ role: "tool", ...(typeof value.id === "string" ? { toolCallId: value.id } : {}), ...(typeof value.name === "string" ? { toolName: value.name } : {}), status: "running", input: value.arguments });
    if (value.type === "toolResult") items.push({ role: "tool", ...(typeof value.toolCallId === "string" ? { toolCallId: value.toolCallId } : {}), ...(typeof value.toolName === "string" ? { toolName: value.toolName } : {}), status: value.isError ? "failed" : "completed", output: value.content });
  }
  return items;
}

function messageText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && !Array.isArray(part) && (part as Record<string, unknown>).type === "text" && typeof (part as Record<string, unknown>).text === "string").map((part) => part.text).join("");
}

export function loadModelCatalog({ agentDir = getAgentDir() }: { agentDir?: string } = {}) {
  const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
  const registry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  const models = registry.getAll().map((model) => ({
    provider: model.provider,
    id: model.id,
    name: model.name,
    available: registry.hasConfiguredAuth(model),
    input: model.input,
    reasoning: model.reasoning,
  }));
  const providerIds = [...new Set([...models.map(({ provider }) => provider), ...authStorage.list()])].sort();
  const providers = providerIds.map((id) => ({
    id,
    name: registry.getProviderDisplayName(id),
    ...registry.getProviderAuthStatus(id),
  }));
  const errors: string[] = [];
  if (authStorage.drainErrors().length) errors.push("auth.json could not be loaded; fix or remove the invalid file");
  if (registry.getError()) errors.push("models.json could not be loaded; fix or remove the invalid file");
  return { providers, models, customEndpoints: loadCustomEndpoints(agentDir), errors };
}

type CustomEndpoint = { id: string; name: string; baseUrl: string; credentialReference: string; models: Array<{ id: string; name: string }> };
type ModelsConfig = { providers: Record<string, { name?: string; baseUrl: string; apiKey: string; api?: string; models?: Array<{ id: string; name?: string }> }> };
type Ownership = { ids: string[] };

function loadCustomEndpoints(agentDir: string): CustomEndpoint[] {
  try {
    const ownership = JSON.parse(requireFile(join(agentDir, "pi-ocarina-endpoints.json"))) as Ownership;
    const config = JSON.parse(requireFile(join(agentDir, "models.json"))) as ModelsConfig;
    return ownership.ids.flatMap((id) => {
      const provider = config.providers?.[id];
      if (!provider) return [];
      return [{
        id,
        name: provider.name ?? id,
        baseUrl: provider.baseUrl,
        credentialReference: provider.apiKey,
        models: (provider.models ?? []).map((model) => ({ id: model.id, name: model.name ?? model.id })),
      }];
    });
  } catch {
    return [];
  }
}

function requireFile(path: string) {
  return readFileSync(path, "utf8");
}

export async function saveCustomEndpoint(payload: unknown = {}, agentDir = getAgentDir()) {
  const endpoint = validateCustomEndpoint(payload);
  await mkdir(agentDir, { recursive: true });
  const modelsPath = join(agentDir, "models.json");
  const ownershipPath = join(agentDir, "pi-ocarina-endpoints.json");
  const config = await readJson<ModelsConfig>(modelsPath, { providers: {} });
  const ownership = await readJson<Ownership>(ownershipPath, { ids: [] });
  const registry = ModelRegistry.create(AuthStorage.create(join(agentDir, "auth.json")), modelsPath);
  const owned = ownership.ids.includes(endpoint.id);
  if (!owned && (config.providers?.[endpoint.id] || registry.getAll().some(({ provider }) => provider === endpoint.id))) {
    throw new Error("Provider identifier is already in use");
  }
  config.providers ??= {};
  config.providers[endpoint.id] = {
    name: endpoint.name,
    baseUrl: endpoint.baseUrl,
    api: "openai-completions",
    apiKey: endpoint.credentialReference,
    models: endpoint.models,
  };
  if (!owned) ownership.ids.push(endpoint.id);
  await writeJsonAtomic(ownershipPath, ownership);
  await writeJsonAtomic(modelsPath, config);
  return loadModelCatalog({ agentDir });
}

export async function deleteCustomEndpoint({ id }: { id?: string } = {}, agentDir = getAgentDir()) {
  if (typeof id !== "string" || !id) throw new Error("Endpoint identifier is required");
  const modelsPath = join(agentDir, "models.json");
  const ownershipPath = join(agentDir, "pi-ocarina-endpoints.json");
  const ownership = await readJson<Ownership>(ownershipPath, { ids: [] });
  if (!ownership.ids.includes(id)) throw new Error("Endpoint is not managed by Pi Ocarina");
  const config = await readJson<ModelsConfig>(modelsPath, { providers: {} });
  delete config.providers?.[id];
  ownership.ids = ownership.ids.filter((ownedId) => ownedId !== id);
  await writeJsonAtomic(modelsPath, config);
  await writeJsonAtomic(ownershipPath, ownership);
  return loadModelCatalog({ agentDir });
}

function validateCustomEndpoint(payload: unknown): CustomEndpoint {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid endpoint");
  const { id, name, baseUrl, credentialReference, models } = payload as Record<string, unknown>;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error("Provider identifier must use lowercase letters, numbers, dashes, or underscores");
  if (typeof name !== "string" || !name.trim()) throw new Error("Endpoint name is required");
  if (typeof baseUrl !== "string") throw new Error("Base URL must be a valid URL");
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("Base URL must be a valid URL"); }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error("Remote endpoints must use HTTPS");
  if (url.username || url.password) throw new Error("Base URL must not contain credentials");
  if (typeof credentialReference !== "string" || !/^[A-Z_][A-Z0-9_]*$/.test(credentialReference)) {
    throw new Error("Credential reference must be an environment variable name");
  }
  if (!Array.isArray(models) || models.length === 0 || models.some((model) => {
    if (!model || typeof model !== "object" || Array.isArray(model)) return true;
    const modelId = (model as Record<string, unknown>).id;
    return typeof modelId !== "string" || !modelId.trim();
  })) {
    throw new Error("At least one model identifier is required");
  }
  return {
    id,
    name: name.trim(),
    baseUrl: url.toString().replace(/\/$/, ""),
    credentialReference,
    models: models.map((model) => { const record = model as Record<string, unknown>; const modelId = String(record.id).trim(); return { id: modelId, name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : modelId }; }),
  };
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return structuredClone(fallback);
    throw new Error(`${path.split("/").at(-1)} could not be loaded`, { cause: error });
  }
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

export function saveProviderCredential({ provider, apiKey }: { provider?: string; apiKey?: string } = {}, agentDir = getAgentDir()) {
  if (typeof provider !== "string" || !provider || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Provider and API key are required");
  }
  const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
  const registry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  if (!registry.getAll().some((model) => model.provider === provider)) throw new Error("Unsupported provider");
  const status = registry.getProviderAuthStatus(provider);
  if (status.source && status.source !== "stored") {
    throw new Error("This provider is managed externally");
  }
  authStorage.set(provider, { type: "api_key", key: apiKey.trim() });
  if (authStorage.drainErrors().length) throw new Error("Credential could not be saved");
  return loadModelCatalog({ agentDir });
}

function watchCatalog(payload: { agentDir?: string }, signal: AbortSignal, publish: (catalog: ReturnType<typeof loadModelCatalog>) => void) {
  const agentDir = payload.agentDir ?? getAgentDir();
  const paths = [join(agentDir, "auth.json"), join(agentDir, "models.json")];
  publish(loadModelCatalog({ agentDir }));
  return new Promise((resolve) => {
    const refresh = () => publish(loadModelCatalog({ agentDir }));
    paths.forEach((path) => watchFile(path, { interval: 500 }, refresh));
    signal.addEventListener("abort", () => {
      paths.forEach((path) => unwatchFile(path, refresh));
      resolve({ stopped: true });
    }, { once: true });
  });
}

async function provePiSession(_payload: Record<string, unknown>, createSession: CreateSession) {
  const root = await mkdtemp(join(tmpdir(), "pi-ocarina-sdk-proof-"));
  try {
    const { session } = await createSession({
      cwd: root,
      agentDir: join(root, "agent"),
      noTools: "all",
      sessionManager: SessionManager.inMemory(root),
    });
    session.dispose();
    return { sdk: "@mariozechner/pi-coding-agent", session: "created" };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function promptPi({ prompt, cwd = process.cwd(), agentDir }: { prompt: string; cwd?: string; agentDir?: string }, signal: AbortSignal, createSession: CreateSession) {
  if (typeof prompt !== "string" || !prompt) throw new Error("Prompt is required");
  const { session } = await createSession({ cwd, ...agentDirOption(agentDir), sessionManager: SessionManager.inMemory(cwd) });
  const abort = () => session.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) await session.abort();
    await session.prompt(prompt);
    return { completed: true };
  } finally {
    signal.removeEventListener("abort", abort);
    session.dispose();
  }
}

function wait(ms = 0, signal: AbortSignal) {
  return new Promise<{ waited: number }>((resolve, reject) => {
    const timer = setTimeout(() => resolve({ waited: ms }), ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Cancelled"));
    }, { once: true });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) serve();
