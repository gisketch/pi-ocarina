import assert from "node:assert/strict";
import test from "node:test";
import { movePinned, organizeThreads, togglePinned } from "./thread-organization.js";
import type { ThreadMetadata } from "@/shared/contracts/app";

test("thread organization is stable, searchable, pinnable, reorderable, and archivable", () => {
  const threads = [
    { sessionFile: "b", title: "Beta", modified: "2026-01-01" },
    { sessionFile: "a", title: "Alpha", modified: "2026-01-01" },
    { sessionFile: "c", title: "Closed", modified: "2026-02-01" },
  ];
  let metadata: ThreadMetadata = { c: { archived: true } };
  metadata = togglePinned(metadata, "b");
  metadata = togglePinned(metadata, "a");
  metadata = movePinned(metadata, "a", -1);
  assert.deepEqual(organizeThreads(threads, metadata).active.map(({ sessionFile }) => sessionFile), ["a", "b"]);
  assert.deepEqual(organizeThreads(threads, metadata).archived.map(({ sessionFile }) => sessionFile), ["c"]);
  assert.deepEqual(organizeThreads(threads, metadata, "alp").active.map(({ sessionFile }) => sessionFile), ["a"]);
  metadata = togglePinned(metadata, "a");
  assert.equal(metadata.a?.pin_order, undefined);
});
