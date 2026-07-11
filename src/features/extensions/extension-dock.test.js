import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_DOCK, reduceDock } from "./extension-dock.js";

test("dock updates replace keyed session output", () => {
  let state = reduceDock(EMPTY_DOCK, { kind: "status", key: "build", value: "Starting" });
  state = reduceDock(state, { kind: "status", key: "build", value: "Ready" });
  state = reduceDock(state, { kind: "widget", key: "plan", value: ["1 done", "2 open"] });
  assert.deepEqual(state, { title: "", statuses: { build: "Ready" }, widgets: { plan: "1 done\n2 open" } });
  assert.deepEqual(reduceDock(state, { kind: "status", key: "build", value: undefined }).statuses, {});
});
