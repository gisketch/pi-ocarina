import assert from "node:assert/strict";
import test from "node:test";
import { buildFileTree, filterFileTree } from "./file-tree";

test("builds deterministic folder-first changed-file trees", () => {
  const tree = buildFileTree([{ path: "README.md", status: "M" }, { path: "src/z.ts", status: "A" }, { path: "src/a.ts", status: "M" }]);
  assert.equal(tree[0]?.kind, "folder");
  assert.equal(tree[0]?.path, "src");
  if (tree[0]?.kind === "folder") assert.deepEqual(tree[0].children.map((node) => node.name), ["a.ts", "z.ts"]);
  assert.equal(tree[1]?.path, "README.md");
});

test("filter preserves matching ancestors", () => {
  const filtered = filterFileTree(buildFileTree([{ path: "src/features/review/panel.tsx" }, { path: "src/app.tsx" }]), "panel");
  assert.equal(filtered[0]?.path, "src");
  if (filtered[0]?.kind === "folder") assert.equal(filtered[0].children[0]?.path, "src/features");
});
