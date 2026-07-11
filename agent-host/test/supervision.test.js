import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SupervisionStore } from "../src/supervision.js";

test("supervision gates, bounded evidence, persistence, and reconciliation are deterministic", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-supervision-")); const path = join(root, "state.json");
  try {
    const store = new SupervisionStore(path); store.gate("child", "continue");
    for (let i = 0; i < 105; i += 1) store.evidence("child", "report", `report ${i}`);
    store.reconcile("child", "running"); const count = store.get("child").evidence.length; store.reconcile("child", "running");
    assert.equal(store.get("child").evidence.length, count); assert.equal(count, 100);
    assert.equal(new SupervisionStore(path).get("child").state, "running");
    store.reconcile("child", "completed"); assert.equal(store.get("child").state, "completed");
  } finally { await rm(root, { recursive: true, force: true }); }
});
