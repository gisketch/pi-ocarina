import test from "node:test";
import assert from "node:assert/strict";
import { pendingNewThread, pendingThreadFile } from "./thread-navigation.js";

test("cross-workspace thread handoff preserves pending selection", () => {
  const value = JSON.stringify({ workspaceId: "project-b", sessionFile: "thread.jsonl" });
  assert.equal(pendingThreadFile(value, "project-b"), "thread.jsonl");
  assert.equal(pendingThreadFile(value, "project-a"), undefined);
  assert.equal(pendingThreadFile("invalid", "project-b"), undefined);
});

test("cross-workspace new-thread handoff targets one workspace", () => {
  assert.equal(pendingNewThread("project-b", "project-b"), true);
  assert.equal(pendingNewThread("project-b", "project-a"), false);
  assert.equal(pendingNewThread(null, "project-b"), false);
});
