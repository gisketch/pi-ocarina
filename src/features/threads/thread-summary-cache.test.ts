import test from "node:test";
import assert from "node:assert/strict";
import { cachedThreadSummaries, cachedWorkspaceThreads, cacheThreadSummaries } from "./thread-summary-cache.js";

test("thread summaries survive a workspace runner remount", () => {
  const alpha = [{ sessionFile: "alpha.jsonl", title: "Alpha" }];
  const beta = [{ sessionFile: "beta.jsonl", title: "Beta" }];
  cacheThreadSummaries("alpha", alpha);
  cacheThreadSummaries("beta", beta);
  assert.equal(cachedThreadSummaries("beta"), beta);
  assert.deepEqual(cachedWorkspaceThreads(["alpha", "beta", "empty"]), { alpha, beta });
});
