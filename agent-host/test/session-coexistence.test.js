import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { acquireLease, leasePath, sessionSchema, shouldRefreshFromDisk } from "../src/session-coexistence.js";

test("disk refresh only wins while idle and newer than the baseline", () => {
  assert.equal(shouldRefreshFromDisk(2, 1, false), true);
  assert.equal(shouldRefreshFromDisk(2, 1, true), false);
  assert.equal(shouldRefreshFromDisk(1, 1, false), false);
  assert.equal(shouldRefreshFromDisk(2, undefined, false), false);
});

test("session lease blocks live writers and replaces stale holders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ocarina-lease-"));
  const session = join(dir, "thread.jsonl");
  const path = leasePath(session);
  try {
    await writeFile(session, '{"type":"session","version":1}\n');
    await writeFile(path, JSON.stringify({ pid: process.pid, hostname: "other-host", surface: "cli" }));
    await assert.rejects(acquireLease(session), /active/);

    await writeFile(path, JSON.stringify({ pid: 999_999_999, hostname: hostname(), surface: "desktop" }));
    await acquireLease(session);
    assert.equal(JSON.parse(await readFile(path, "utf8")).pid, process.pid);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("newer Pi schema is detected conservatively", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ocarina-schema-"));
  const session = join(dir, "thread.jsonl");
  try {
    await writeFile(session, '{"type":"session","version":9}\n{"type":"message"}\n');
    assert.deepEqual(await sessionSchema(session, 3), { fileVersion: 9, runtimeVersion: 3, newer: true });
    await writeFile(session, '{"type":"session","version":3}\n');
    assert.equal((await sessionSchema(session, 3)).newer, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
