import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectRuntime, loadModelCatalog } from "../src/host.js";

test("pinned runtime imports upstream Pi and discovers a workspace extension", async () => {
  assert.match(process.versions.node, /^20\./);
  const cwd = await mkdtemp(join(tmpdir(), "pi-ocarina-runtime-"));
  const extensionDir = join(cwd, ".pi", "extensions");
  const extensionPath = join(extensionDir, "proof.js");
  await mkdir(extensionDir, { recursive: true });
  await writeFile(extensionPath, "export default function () {}\n");

  const result = await inspectRuntime({ cwd });
  assert.equal(result.node.startsWith("20."), true);
  assert.equal(result.extensions.includes(extensionPath), true);
  assert.deepEqual(result.errors, []);
});

test("model catalog uses upstream config without exposing credential values", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-ocarina-agent-"));
  await writeFile(join(agentDir, "auth.json"), JSON.stringify({
    anthropic: { type: "api_key", key: "NEVER_EXPOSE_THIS" },
  }));

  const catalog = loadModelCatalog({ agentDir });
  const anthropic = catalog.providers.find(({ id }) => id === "anthropic");
  assert.equal(anthropic.configured, true);
  assert.equal(anthropic.source, "stored");
  assert.equal(JSON.stringify(catalog).includes("NEVER_EXPOSE_THIS"), false);

  await writeFile(join(agentDir, "models.json"), "not json");
  assert.deepEqual(loadModelCatalog({ agentDir }).errors, [
    "models.json could not be loaded; fix or remove the invalid file",
  ]);
});
