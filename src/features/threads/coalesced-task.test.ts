import test from "node:test";
import assert from "node:assert/strict";
import { createCoalescedTask } from "./coalesced-task.js";

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

test("rapid draft updates collapse to the latest durable write", async () => {
  const writes: string[] = [];
  const task = createCoalescedTask<string>((value) => { writes.push(value); }, 15);
  task.schedule("h");
  task.schedule("he");
  task.schedule("hello");
  await wait(30);
  assert.deepEqual(writes, ["hello"]);
});

test("flush writes the latest draft immediately", async () => {
  const writes: string[] = [];
  const task = createCoalescedTask<string>((value) => { writes.push(value); }, 1000);
  task.schedule("safe draft");
  assert.equal(task.pending(), true);
  await task.flush();
  assert.equal(task.pending(), false);
  assert.deepEqual(writes, ["safe draft"]);
});
