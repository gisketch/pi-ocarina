import assert from "node:assert/strict";
import test from "node:test";
import { additionEditorModel, editorStats, numberEditorLines, parseUnifiedDiff } from "./editor-model";

test("numbers editor lines and counts changes", () => {
  const source = [{ kind: "remove" as const, text: "old" }, { kind: "add" as const, text: "new" }, { kind: "context" as const, text: "same" }];
  assert.deepEqual(editorStats(source), { additions: 1, deletions: 1 });
  assert.deepEqual(numberEditorLines(source), [
    { kind: "remove", text: "old", oldLine: 1, newLine: null },
    { kind: "add", text: "new", oldLine: null, newLine: 1 },
    { kind: "context", text: "same", oldLine: 2, newLine: 2 },
  ]);
});

test("parses bounded unified diff hunks without rendering git metadata", () => {
  const model = parseUnifiedDiff("diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -10,2 +10,2 @@\n-old\n+new\n same\n");
  assert.deepEqual({ additions: model.additions, deletions: model.deletions, truncated: model.truncated }, { additions: 1, deletions: 1, truncated: false });
  assert.deepEqual(model.lines, [
    { kind: "remove", text: "old", oldLine: 10, newLine: null },
    { kind: "add", text: "new", oldLine: null, newLine: 10 },
    { kind: "context", text: "same", oldLine: 11, newLine: 11 },
  ]);
});

test("malformed diff remains readable metadata", () => {
  assert.deepEqual(parseUnifiedDiff("not a diff").lines[0], { kind: "meta", text: "not a diff", oldLine: null, newLine: null });
});

test("new file content normalizes as additions", () => {
  const model = additionEditorModel("first\nsecond");
  assert.deepEqual({ additions: model.additions, deletions: model.deletions }, { additions: 2, deletions: 0 });
  assert.equal(model.lines[1]?.newLine, 2);
});
