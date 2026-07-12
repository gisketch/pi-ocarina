import assert from "node:assert/strict";
import test from "node:test";
import { initialToolDisclosure, reduceToolDisclosure } from "./tool-disclosure";

test("progressive tools auto-expand once and then preserve user disclosure", () => {
  const expanded = reduceToolDisclosure(initialToolDisclosure(), { type: "progressive" });
  assert.deepEqual(expanded, { open: true, autoExpanded: true, userControlled: false });
  const collapsed = reduceToolDisclosure(expanded, { type: "user-toggle" });
  assert.equal(collapsed.open, false);
  assert.equal(reduceToolDisclosure(collapsed, { type: "progressive" }).open, false);
});
