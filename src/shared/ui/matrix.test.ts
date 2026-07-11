import test from "node:test";
import assert from "node:assert/strict";
import { matrixPath, matrixTonePaths, proceduralAvatar } from "./matrix.js";

test("matrix rendering is deterministic and symmetric", () => {
  assert.equal(matrixPath("1001", 2, 2), "M0 0h4v4h-4zM5 5h4v4h-4z");
  assert.deepEqual(matrixTonePaths("1111", 2, 2, "seed"), matrixTonePaths("1111", 2, 2, "seed"));
  const avatar = proceduralAvatar("pi-ocarina", 5);
  for (let row = 0; row < 5; row += 1) assert.equal(avatar.slice(row * 5, row * 5 + 5), [...avatar.slice(row * 5, row * 5 + 5)].reverse().join(""));
});
