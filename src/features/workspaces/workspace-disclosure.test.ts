import test from "node:test";
import assert from "node:assert/strict";
import { toggleWorkspaceDisclosure } from "./workspace-disclosure.js";

test("workspace disclosures start expanded and toggle independently", () => {
  const initial = new Set<string>();
  const collapsed = toggleWorkspaceDisclosure(initial, "alpha");
  assert.deepEqual([...initial], []);
  assert.deepEqual([...collapsed], ["alpha"]);
  assert.deepEqual([...toggleWorkspaceDisclosure(collapsed, "alpha")], []);
  assert.equal(collapsed.has("new-workspace"), false);
});
