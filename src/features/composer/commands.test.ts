import assert from "node:assert/strict";
import test from "node:test";

import { extensionMentions, mergeCommands, parseComposerControl, slashSuggestions } from "./commands.js";

test("runtime commands win deterministic collisions and slash filtering preserves order", () => {
  const runtime = [
    { name: "model", source: "extension", description: "Runtime model" },
    { name: "review", source: "prompt" },
    { name: "skill:ship", source: "skill" },
  ];
  assert.equal(mergeCommands(runtime).find(({ name }) => name === "model")?.description, "Runtime model");
  assert.deepEqual(slashSuggestions("/r", runtime).map(({ name }) => name), ["review"]);
  assert.deepEqual(slashSuggestions("plain text", runtime), []);
  assert.deepEqual(parseComposerControl("/thinking high"), { type: "thinking", value: "high" });
  assert.deepEqual(parseComposerControl("/model openai/gpt-5"), { type: "model", provider: "openai", id: "gpt-5" });
});

test("extension mentions preserve package identifiers and ignore disabled records", () => {
  assert.deepEqual(extensionMentions("use @scope", [{ source: "@scope/pkg", label: "@scope/pkg", enabled: true }, { source: "scope-old", label: "scope-old", enabled: false }]).map(({ source }) => source), ["@scope/pkg"]);
});
