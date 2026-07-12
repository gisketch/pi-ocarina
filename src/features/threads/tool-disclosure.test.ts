import assert from "node:assert/strict";
import test from "node:test";
import { initialToolDisclosure, reduceToolDisclosure } from "./tool-disclosure";

test("active tools auto-expand and collapse when activity finishes", () => {
  const expanded = reduceToolDisclosure(initialToolDisclosure(), { type: "activity", active: true });
  assert.deepEqual(expanded, { open: true, autoExpanded: true, userControlled: false });
  const completed = reduceToolDisclosure(expanded, { type: "activity", active: false });
  assert.deepEqual(completed, { open: false, autoExpanded: true, userControlled: false });
});

test("manual disclosure is preserved across lifecycle updates", () => {
  const expanded = reduceToolDisclosure(initialToolDisclosure(), { type: "activity", active: true });
  const collapsed = reduceToolDisclosure(expanded, { type: "user-toggle" });
  assert.equal(collapsed.open, false);
  assert.equal(reduceToolDisclosure(collapsed, { type: "activity", active: false }).open, false);
});
