import assert from "node:assert/strict";
import test from "node:test";

import { deleteSkillTokenAt, expandCommandInvocation, expandSkillInvocation, extensionMentions, mergeCommands, nextSuggestionIndex, parseComposerControl, replaceComposerTrigger, skillSuggestions, skillTokenRanges, slashSuggestions } from "./commands.js";

test("runtime commands win deterministic collisions and slash filtering preserves order", () => {
  const runtime = [
    { name: "model", source: "extension", description: "Runtime model" },
    { name: "review", source: "prompt" },
    { name: "skill:ship", source: "skill" },
  ];
  assert.equal(mergeCommands(runtime).find(({ name }) => name === "model")?.description, "Runtime model");
  assert.equal(mergeCommands(runtime).some(({ source }) => source === "skill"), false);
  assert.deepEqual(slashSuggestions("/r", runtime).map(({ name }) => name), ["review"]);
  assert.deepEqual(slashSuggestions("please /r", runtime).map(({ name }) => name), ["review"]);
  assert.deepEqual(slashSuggestions("plain text", runtime), []);
  assert.deepEqual(parseComposerControl("/thinking high"), { type: "thinking", value: "high" });
  assert.deepEqual(parseComposerControl("/model openai/gpt-5"), { type: "model", provider: "openai", id: "gpt-5" });
});

test("skills use dollar suggestions and translate only when submitted", () => {
  const skills = [{ aliases: ["skill:sonata-work"], description: "Route work", available: true }, { aliases: ["skill:hidden"], available: false }];
  assert.deepEqual(skillSuggestions("$son", skills).map(({ aliases }) => aliases[0]), ["skill:sonata-work"]);
  assert.deepEqual(skillSuggestions("please use $son", skills).map(({ aliases }) => aliases[0]), ["skill:sonata-work"]);
  assert.deepEqual(slashSuggestions("/s", [{ name: "skill:sonata-work", source: "skill" }]), []);
  assert.equal(expandSkillInvocation("$sonata-work fix this", skills), "/skill:sonata-work fix this");
  assert.equal(expandSkillInvocation("please $sonata-work fix this", skills), "/skill:sonata-work please fix this");
  assert.equal(expandSkillInvocation("$unknown fix this", skills), "$unknown fix this");
  assert.equal(expandCommandInvocation("please /review this", [{ name: "review" }]), "/review please this");
  assert.deepEqual(replaceComposerTrigger("please /rev later", 11, "/review "), { value: "please /review later", cursor: 14 });
  assert.deepEqual(skillTokenRanges("use $sonata-work now", skills), [{ start: 4, end: 16, name: "sonata-work" }]);
  assert.deepEqual(skillTokenRanges("use $sonata-work", skills), []);
  assert.deepEqual(deleteSkillTokenAt("use $sonata-work now", 17, "backward", skills), { value: "use now", cursor: 4 });
  assert.deepEqual(deleteSkillTokenAt("use $sonata-work", 16, "backward", skills), { value: "use ", cursor: 4 });
});

test("suggestion navigation wraps in both directions", () => {
  assert.equal(nextSuggestionIndex(0, 1, 3), 1);
  assert.equal(nextSuggestionIndex(2, 1, 3), 0);
  assert.equal(nextSuggestionIndex(0, -1, 3), 2);
});

test("extension mentions preserve package identifiers and ignore disabled records", () => {
  assert.deepEqual(extensionMentions("use @scope", [{ source: "@scope/pkg", label: "@scope/pkg", enabled: true }, { source: "scope-old", label: "scope-old", enabled: false }]).map(({ source }) => source), ["@scope/pkg"]);
});
