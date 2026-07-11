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

export function serve(input = process.stdin, output = process.stdout, createSession = createAgentSession) {
  const active = new Map();
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
      else if (operation === "prompt") result = await promptPi(payload, controller.signal, createSession);
      else if (operation === "watchCatalog") result = await watchCatalog(payload, controller.signal, (catalog) => send(requestId, "catalog", catalog));
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
