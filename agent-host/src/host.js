import { createInterface } from "node:readline";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { readFileSync, unwatchFile, watchFile } from "node:fs";
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
  const runningThreads = new Set();
  const prompts = new Map();
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
    if (operation === "resolveRuntimePrompt") {
      const pending = prompts.get(payload.promptId);
      if (!pending || pending.threadId !== payload.threadId) throw new Error("Runtime prompt is no longer active");
      prompts.delete(payload.promptId);
      pending.resolve(payload.cancelled ? undefined : payload.value);
      send(requestId, "completed", { resolved: payload.promptId });
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
      else if (operation === "listThreads") result = await listThreads(payload, listSessions);
      else if (operation === "openThread") result = await openThread(payload, createSession, listSessions, sessions);
      else if (operation === "recoverThread") result = await recoverThread(payload, createSession, listSessions, sessions, runningThreads);
      else if (operation === "watchThread") result = await watchThread(payload, controller.signal, sessions, (type, event) => send(requestId, type, event));
      else if (operation === "promptThread") result = await promptThread(payload, controller.signal, sessions, runningThreads, prompts, (type, event) => send(requestId, type, event));
      else if (operation === "prompt") result = await promptPi(payload, controller.signal, createSession);
      else if (operation === "watchCatalog") result = await watchCatalog(payload, controller.signal, (catalog) => send(requestId, "catalog", catalog));
      else if (operation === "saveProviderCredential") result = saveProviderCredential(payload);
      else if (operation === "saveCustomEndpoint") result = await saveCustomEndpoint(payload);
      else if (operation === "deleteCustomEndpoint") result = await deleteCustomEndpoint(payload);
      else if (operation === "wait") result = await wait(payload.ms, controller.signal);
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

async function listThreads({ cwd } = {}, listSessions) {
  if (typeof cwd !== "string" || !cwd) throw new Error("Workspace is required");
  return (await listSessions(cwd)).map(({ id, path, name, firstMessage, modified, messageCount }) => ({
    threadId: id,
    sessionFile: path,
    title: name || firstMessage || "Empty thread",
    modified: modified instanceof Date ? modified.toISOString() : modified,
    messageCount,
  }));
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

async function recoverThread({ cwd, threadId, sessionFile, agentDir } = {}, createSession, listSessions, sessions, runningThreads) {
  if (sessions.has(threadId)) return { ...threadSnapshot(sessions.get(threadId)), runStatus: runningThreads.has(threadId) ? "running" : "idle" };
  try {
    return { ...(await openThread({ cwd, sessionFile, agentDir }, createSession, listSessions, sessions)), runStatus: "interrupted" };
  } catch {
    return { threadId, sessionFile, messages: [], runStatus: "missing" };
  }
}

async function promptThread({ threadId, prompt } = {}, signal, sessions, runningThreads, prompts, publish) {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Prompt is required");
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  const unsubscribe = session.subscribe((event) => publishPiEvent(event, threadId, publish));
  const abort = () => { void session.abort(); cancelThreadPrompts(threadId, prompts); };
  session.extensionRunner?.setUIContext(runtimeUi(threadId, prompts, publish));
  signal.addEventListener("abort", abort, { once: true });
  runningThreads.add(threadId);
  try {
    await session.prompt(prompt.trim());
    return threadSnapshot(session);
  } finally {
    signal.removeEventListener("abort", abort);
    runningThreads.delete(threadId);
    cancelThreadPrompts(threadId, prompts);
    unsubscribe();
  }
}

function watchThread({ threadId } = {}, signal, sessions, publish) {
  const session = sessions.get(threadId);
  if (!session) throw new Error("Thread is not open");
  return new Promise((resolve) => {
    const unsubscribe = session.subscribe((event) => publishPiEvent(event, threadId, publish));
    signal.addEventListener("abort", () => { unsubscribe(); resolve({ stopped: true }); }, { once: true });
  });
}

function publishPiEvent(event, threadId, publish) {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") publish("messageDelta", { threadId, delta: event.assistantMessageEvent.delta });
  else if (event.type === "tool_execution_start") publish("toolCall", { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: "running", input: event.args });
  else if (event.type === "tool_execution_update") publish("toolCall", { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: "running", output: event.partialResult });
  else if (event.type === "tool_execution_end") publish("toolCall", { threadId, toolCallId: event.toolCallId, toolName: event.toolName, status: event.isError ? "failed" : "completed", output: event.result });
}

function cancelThreadPrompts(threadId, prompts) {
  for (const [id, pending] of prompts) if (pending.threadId === threadId) { prompts.delete(id); pending.resolve(undefined); }
}

function runtimeUi(threadId, prompts, publish) {
  const ask = (kind, title, message, options) => new Promise((resolve) => {
    const promptId = crypto.randomUUID();
    prompts.set(promptId, { threadId, resolve });
    publish("runtimePrompt", { promptId, threadId, kind, title, message, options });
  });
  return {
    select: (title, options) => ask("select", title, undefined, options),
    confirm: async (title, message) => Boolean(await ask("confirm", title, message)),
    input: (title, placeholder) => ask("input", title, placeholder),
    notify: (message, type = "info") => publish("runtimeNotice", { threadId, message, type }),
    onTerminalInput: () => () => {}, setStatus() {}, setWorkingMessage() {}, setWorkingVisible() {}, setWorkingIndicator() {},
    setHiddenThinkingLabel() {}, setWidget() {}, setFooter() {}, setHeader() {}, setTitle() {},
    pasteToEditor: (text) => publish("editorText", { threadId, text, mode: "append" }),
    setEditorText: (text) => publish("editorText", { threadId, text, mode: "replace" }),
    getEditorText: () => "", editor: (title, prefill) => ask("input", title, prefill),
    custom: () => Promise.resolve(undefined), setAutocompleteProvider() {},
  };
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/required|unavailable|not open|cancelled|unsupported|validation/i.test(message)) return message;
  return "Agent run failed. Check provider settings and try again.";
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
  return { providers, models, customEndpoints: loadCustomEndpoints(agentDir), errors };
}

function loadCustomEndpoints(agentDir) {
  try {
    const ownership = JSON.parse(requireFile(join(agentDir, "pi-ocarina-endpoints.json")));
    const config = JSON.parse(requireFile(join(agentDir, "models.json")));
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

function requireFile(path) {
  return readFileSync(path, "utf8");
}

export async function saveCustomEndpoint(payload = {}, agentDir = getAgentDir()) {
  const endpoint = validateCustomEndpoint(payload);
  await mkdir(agentDir, { recursive: true });
  const modelsPath = join(agentDir, "models.json");
  const ownershipPath = join(agentDir, "pi-ocarina-endpoints.json");
  const config = await readJson(modelsPath, { providers: {} });
  const ownership = await readJson(ownershipPath, { ids: [] });
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

export async function deleteCustomEndpoint({ id } = {}, agentDir = getAgentDir()) {
  if (typeof id !== "string" || !id) throw new Error("Endpoint identifier is required");
  const modelsPath = join(agentDir, "models.json");
  const ownershipPath = join(agentDir, "pi-ocarina-endpoints.json");
  const ownership = await readJson(ownershipPath, { ids: [] });
  if (!ownership.ids.includes(id)) throw new Error("Endpoint is not managed by Pi Ocarina");
  const config = await readJson(modelsPath, { providers: {} });
  delete config.providers?.[id];
  ownership.ids = ownership.ids.filter((ownedId) => ownedId !== id);
  await writeJsonAtomic(modelsPath, config);
  await writeJsonAtomic(ownershipPath, ownership);
  return loadModelCatalog({ agentDir });
}

function validateCustomEndpoint({ id, name, baseUrl, credentialReference, models } = {}) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id ?? "")) throw new Error("Provider identifier must use lowercase letters, numbers, dashes, or underscores");
  if (typeof name !== "string" || !name.trim()) throw new Error("Endpoint name is required");
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error("Base URL must be a valid URL"); }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error("Remote endpoints must use HTTPS");
  if (url.username || url.password) throw new Error("Base URL must not contain credentials");
  if (typeof credentialReference !== "string" || !/^[A-Z_][A-Z0-9_]*$/.test(credentialReference)) {
    throw new Error("Credential reference must be an environment variable name");
  }
  if (!Array.isArray(models) || models.length === 0 || models.some((model) => typeof model?.id !== "string" || !model.id.trim())) {
    throw new Error("At least one model identifier is required");
  }
  return {
    id,
    name: name.trim(),
    baseUrl: url.toString().replace(/\/$/, ""),
    credentialReference,
    models: models.map((model) => ({ id: model.id.trim(), name: model.name?.trim() || model.id.trim() })),
  };
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw new Error(`${path.split("/").at(-1)} could not be loaded`);
  }
}

async function writeJsonAtomic(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
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
