import { createInterface } from "node:readline";
import { mkdtemp, rm } from "node:fs/promises";
import { unwatchFile, watchFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  discoverAndLoadExtensions,
  getAgentDir,
} from "@mariozechner/pi-coding-agent";

export const PROTOCOL_VERSION = 1;

export async function inspectRuntime({ cwd = process.cwd(), extensionPaths = [] } = {}) {
  const authStorage = AuthStorage.create();
  const models = new ModelRegistry(authStorage).getAvailable();
  const extensions = await discoverAndLoadExtensions(extensionPaths, cwd);

  return {
    node: process.versions.node,
    models: models.length,
    extensions: extensions.extensions.map(({ path }) => path),
    errors: extensions.errors.map(({ error }) => error),
  };
}

export function serve(input = process.stdin, output = process.stdout, createSession = createAgentSession, resolveModel = resolveSelectedModel, listSessions = SessionManager.list) {
  const active = new Map();
  const sessions = new Map();
  const send = (requestId, type, payload = {}) =>
    output.write(`${JSON.stringify({ version: PROTOCOL_VERSION, requestId, type, payload })}\n`);

  const run = async (request) => {
    const { version, requestId, operation, payload = {} } = request;
    if (version !== PROTOCOL_VERSION || typeof requestId !== "string" || !requestId || typeof operation !== "string") {
      throw new Error("Invalid protocol request");
    }
    if (operation === "cancel") {
      const target = active.get(payload.requestId);
      if (!target) throw new Error(`Request is not active: ${payload.requestId}`);
      target.abort();
      send(requestId, "completed", { cancelled: payload.requestId });
      return;
    }
    if (active.has(requestId)) throw new Error(`Request is already active: ${requestId}`);

    const controller = new AbortController();
    active.set(requestId, controller);
    send(requestId, "started");
    try {
      let result;
      if (operation === "inspectRuntime") result = await inspectRuntime(payload);
      else if (operation === "createSession") result = await provePiSession(payload, createSession);
      else if (operation === "createThread") result = await createThread(payload, createSession, resolveModel, sessions);
      else if (operation === "openThread") result = await openThread(payload, createSession, listSessions, sessions);
      else if (operation === "promptThread") result = await promptThread(payload, controller.signal, sessions, (type, event) => send(requestId, type, event));
      else if (operation === "prompt") result = await promptPi(payload, controller.signal, createSession);
      else if (operation === "watchCatalog") result = await watchCatalog(payload, controller.signal, (catalog) => send(requestId, "catalog", catalog));
      else if (operation === "saveProviderCredential") result = saveProviderCredential(payload);
      else if (operation === "wait") result = await wait(payload.ms, controller.signal);
      else throw new Error(`Unsupported operation: ${operation}`);
      if (controller.signal.aborted) throw new Error("Cancelled");
      send(requestId, "completed", result);
    } catch (error) {
      send(requestId, controller.signal.aborted ? "cancelled" : "failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      active.delete(requestId);
    }
  };

  createInterface({ input }).on("line", (line) => {
    if (!line.trim()) return;
    try {
      const request = JSON.parse(line);
      void run(request).catch((error) =>
        send(typeof request.requestId === "string" ? request.requestId : "unknown", "failed", {
          message: error.message,
        }),
      );
    } catch {
      send("unknown", "failed", { message: "Malformed JSON request" });
    }
  });
}

async function createThread({ cwd, provider, modelId, agentDir } = {}, createSession, resolveModel, sessions) {
  if (typeof cwd !== "string" || !cwd) throw new Error("Workspace is required");
  const { authStorage, modelRegistry, model } = resolveModel({ provider, modelId, agentDir });
  const { session } = await createSession({
    cwd,
    agentDir,
    authStorage,
    modelRegistry,
    model,
    sessionManager: SessionManager.create(cwd),
  });
  sessions.set(session.sessionId, session);
  return threadSnapshot(session);
}

function resolveSelectedModel({ provider, modelId, agentDir }) {
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

async function openThread({ cwd, sessionFile, agentDir } = {}, createSession, listSessions, sessions) {
  if (typeof cwd !== "string" || !cwd || typeof sessionFile !== "string" || !sessionFile) {
    throw new Error("Workspace and session file are required");
  }
  const available = await listSessions(cwd);
  if (!available.some(({ path }) => path === sessionFile)) throw new Error("Session does not belong to this workspace");
  const { session } = await createSession({ cwd, agentDir, sessionManager: SessionManager.open(sessionFile) });
  sessions.set(session.sessionId, session);
  return threadSnapshot(session);
}

async function promptThread({ threadId, prompt } = {}, signal, sessions, publish) {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Prompt is required");
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      publish("messageDelta", { threadId, delta: event.assistantMessageEvent.delta });
    } else if (event.type === "tool_execution_start") {
      publish("toolCall", { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: "running", input: event.args });
    } else if (event.type === "tool_execution_update") {
      publish("toolCall", { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: "running", output: event.partialResult });
    } else if (event.type === "tool_execution_end") {
      publish("toolCall", { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: event.isError ? "failed" : "completed", output: event.result });
    }
  });
  const abort = () => session.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await session.prompt(prompt.trim());
    return threadSnapshot(session);
  } finally {
    signal.removeEventListener("abort", abort);
    unsubscribe();
  }
}

function threadSnapshot(session) {
  return {
    threadId: session.sessionId,
    sessionFile: session.sessionFile,
    messages: session.messages.flatMap(({ role, content }) => transcriptItems(role, content)),
  };
}

function transcriptItems(role, content) {
  const text = messageText(content);
  const items = text ? [{ role, text }] : [];
  if (!Array.isArray(content)) return items;
  for (const part of content) {
    if (part?.type === "toolCall") items.push({ role: "tool", toolCallId: part.id, toolName: part.name, status: "running", input: part.arguments });
    if (part?.type === "toolResult") items.push({ role: "tool", toolCallId: part.toolCallId, toolName: part.toolName, status: part.isError ? "failed" : "completed", output: part.content });
  }
  return items;
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text").map((part) => part.text).join("");
}

export function loadModelCatalog({ agentDir = getAgentDir() } = {}) {
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
  const errors = [];
  if (authStorage.drainErrors().length) errors.push("auth.json could not be loaded; fix or remove the invalid file");
  if (registry.getError()) errors.push("models.json could not be loaded; fix or remove the invalid file");
  return { providers, models, errors };
}

export function saveProviderCredential({ provider, apiKey } = {}, agentDir = getAgentDir()) {
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

function watchCatalog(payload, signal, publish) {
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

async function provePiSession(_payload, createSession) {
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

async function promptPi({ prompt, cwd = process.cwd(), agentDir } = {}, signal, createSession) {
  if (typeof prompt !== "string" || !prompt) throw new Error("Prompt is required");
  const { session } = await createSession({ cwd, agentDir, sessionManager: SessionManager.inMemory(cwd) });
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

function wait(ms = 0, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ waited: ms }), ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Cancelled"));
    }, { once: true });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) serve();
