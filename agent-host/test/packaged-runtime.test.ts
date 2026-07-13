import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { deleteCustomEndpoint, inspectRuntime, loadModelCatalog, loadWorkspaceResources, saveCustomEndpoint, saveProviderCredential } from "../src/host.js";

test("pinned runtime imports upstream Pi and discovers a workspace extension", async () => {
  assert.match(process.versions.node, /^22\./);
  const cwd = await mkdtemp(join(tmpdir(), "pi-ocarina-runtime-"));
  const extensionDir = join(cwd, ".pi", "extensions");
  const extensionPath = join(extensionDir, "proof.js");
  await mkdir(extensionDir, { recursive: true });
  const skillDir = join(cwd, ".agents", "skills", "proof-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(extensionPath, "export default function (pi) { pi.registerCommand('proof-command', { description: 'Proof command', handler: async () => {} }); }\n");
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: proof-skill\ndescription: Proof skill\n---\n\n# Proof\n");

  const result = await inspectRuntime({ cwd });
  const resources = await loadWorkspaceResources({ cwd });
  assert.equal(result.node.startsWith("22."), true);
  assert.equal(result.extensions.includes(extensionPath), true);
  assert.deepEqual(result.errors, []);
  assert.equal(resources.commands.some(({ name }) => name === "proof-command"), true);
  assert.equal(resources.skills.some(({ aliases }) => aliases.includes("skill:proof-skill")), true);
});

test("model catalog uses upstream config without exposing credential values", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-ocarina-agent-"));
  await writeFile(join(agentDir, "auth.json"), JSON.stringify({
    anthropic: { type: "api_key", key: "NEVER_EXPOSE_THIS" },
  }));

  const catalog = loadModelCatalog({ agentDir });
  const anthropic = catalog.providers.find(({ id }) => id === "anthropic");
  assert.ok(anthropic);
  assert.equal(anthropic.configured, true);
  assert.equal(anthropic.source, "stored");
  assert.equal(JSON.stringify(catalog).includes("NEVER_EXPOSE_THIS"), false);

  await writeFile(join(agentDir, "models.json"), "not json");
  assert.deepEqual(loadModelCatalog({ agentDir }).errors, [
    "models.json could not be loaded; fix or remove the invalid file",
  ]);
});

test("credentials use Pi storage while external providers remain read-only", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-ocarina-credentials-"));
  const secret = "NEVER_RETURN_THIS";
  const catalog = saveProviderCredential({ provider: "anthropic", apiKey: secret }, agentDir);
  assert.equal(catalog.providers.find(({ id }) => id === "anthropic")?.source, "stored");
  assert.equal(JSON.stringify(catalog).includes(secret), false);

  const modelsDir = await mkdtemp(join(tmpdir(), "pi-ocarina-models-file-"));
  await writeFile(join(modelsDir, "models.json"), JSON.stringify({
    providers: {
      local: {
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        apiKey: "LOCAL_ONLY",
        models: [{ id: "local-model" }],
      },
    },
  }));
  const modelsCatalog = loadModelCatalog({ agentDir: modelsDir });
  assert.equal(modelsCatalog.providers.find(({ id }) => id === "local")?.source, "models_json_key");
  assert.deepEqual(modelsCatalog.models.find(({ id }) => id === "local-model")?.thinkingLevels, ["off"]);
  assert.equal(JSON.stringify(modelsCatalog).includes("LOCAL_ONLY"), false);
  assert.throws(
    () => saveProviderCredential({ provider: "local", apiKey: secret }, modelsDir),
    /managed externally/,
  );

  const prior = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "ENV_SECRET";
  try {
    const externalDir = await mkdtemp(join(tmpdir(), "pi-ocarina-external-"));
    assert.throws(
      () => saveProviderCredential({ provider: "anthropic", apiKey: secret }, externalDir),
      /managed externally/,
    );
    assert.equal(JSON.stringify(loadModelCatalog({ agentDir: externalDir })).includes("ENV_SECRET"), false);
  } finally {
    if (prior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prior;
  }
});

test("custom endpoints validate ownership and preserve unrelated providers", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-ocarina-endpoints-"));
  await writeFile(join(agentDir, "models.json"), JSON.stringify({
    providers: { legacy: { baseUrl: "https://legacy.example/v1", api: "openai-completions", apiKey: "LEGACY_KEY", models: [{ id: "legacy" }] } },
  }));
  const endpoint = {
    id: "team-proxy", name: "Team Proxy", baseUrl: "https://proxy.example/v1/",
    credentialReference: "TEAM_PROXY_KEY", models: [{ id: "code-model", name: "Code Model" }],
  };
  let catalog = await saveCustomEndpoint(endpoint, agentDir);
  assert.deepEqual(catalog.customEndpoints.map(({ id }) => id), ["team-proxy"]);
  assert.equal(JSON.stringify(catalog).includes("TEAM_PROXY_KEY"), true);
  await assert.rejects(() => saveCustomEndpoint({ ...endpoint, id: "legacy" }, agentDir), /already in use/);
  await assert.rejects(() => saveCustomEndpoint({ ...endpoint, id: "remote-http", baseUrl: "http://example.com/v1" }, agentDir), /HTTPS/);
  await assert.rejects(() => deleteCustomEndpoint({ id: "legacy" }, agentDir), /not managed/);
  catalog = await deleteCustomEndpoint({ id: "team-proxy" }, agentDir);
  assert.deepEqual(catalog.customEndpoints, []);
  assert.equal(catalog.providers.some(({ id }) => id === "legacy"), true);
});

test("catalog refresh removes stale availability and discovers configured models", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-ocarina-onboarding-"));
  const prior = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    let catalog = loadModelCatalog({ agentDir });
    assert.equal(catalog.models.some(({ provider, available }) => provider === "anthropic" && available), false);
    catalog = saveProviderCredential({ provider: "anthropic", apiKey: "TEST_ONLY" }, agentDir);
    assert.equal(catalog.models.some(({ provider, available }) => provider === "anthropic" && available), true);
    await writeFile(join(agentDir, "auth.json"), "{}");
    catalog = loadModelCatalog({ agentDir });
    assert.equal(catalog.models.some(({ provider, available }) => provider === "anthropic" && available), false);
  } finally {
    if (prior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prior;
  }
});
