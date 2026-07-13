import assert from "node:assert/strict";
import test from "node:test";
import { notificationCategories, shouldNotify, shouldRequestPermission } from "./notification-policy.js";

test("notification onboarding and attention follow background state", () => {
  const categories = { completed: true, failed: true, attention: false };
  assert.equal(shouldRequestPermission({ backgrounded: true, running: true, categories, permission: "default" }), true);
  assert.equal(shouldRequestPermission({ backgrounded: false, running: true, categories, permission: "default" }), false);
  assert.equal(shouldNotify({ focused: true, selected: true, category: "completed", categories }), false);
  assert.equal(shouldNotify({ focused: true, selected: false, category: "failed", categories }), true);
  assert.equal(shouldNotify({ focused: false, selected: true, category: "attention", categories }), false);
});

test("stored notification values accept booleans only", () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { length: 0, clear() {}, getItem: () => JSON.stringify({ completed: false, failed: "no", attention: true }), key: () => null, removeItem() {}, setItem() {} };
  assert.deepEqual(notificationCategories(), { completed: false, failed: true, attention: true });
  globalThis.localStorage = previous;
});
