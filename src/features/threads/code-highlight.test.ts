import assert from "node:assert/strict";
import test from "node:test";
import { highlightCode, languageForPath } from "./code-highlight";

test("detects supported languages from file paths", () => {
  assert.equal(languageForPath("src/tool-call.tsx"), "typescript");
  assert.equal(languageForPath("config/.zshrc"), undefined);
  assert.equal(languageForPath("README.md?raw=1"), "markdown");
});

test("highlights code while escaping source markup", () => {
  const highlighted = highlightCode("const value = '<script>';", "example.ts");
  assert.match(highlighted ?? "", /hljs-keyword/);
  assert.doesNotMatch(highlighted ?? "", /<script>/);
});
