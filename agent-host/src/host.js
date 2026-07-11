import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { AuthStorage, ModelRegistry, discoverAndLoadExtensions } from "@mariozechner/pi-coding-agent";

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

async function main() {
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    if (request.operation !== "inspectRuntime") throw new Error(`Unsupported operation: ${request.operation}`);
    process.stdout.write(`${JSON.stringify({ requestId: request.requestId, result: await inspectRuntime(request.payload) })}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
