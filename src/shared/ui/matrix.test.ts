import test from "node:test";
import assert from "node:assert/strict";
import { matrixPath, matrixTonePaths, proceduralAvatar, proceduralAvatarFrames } from "./matrix.js";

test("matrix rendering is deterministic and symmetric", () => {
  assert.equal(matrixPath("1001", 2, 2), "M0 0h4v4h-4zM5 5h4v4h-4z");
  assert.deepEqual(matrixTonePaths("1111", 2, 2, "seed"), matrixTonePaths("1111", 2, 2, "seed"));
  const avatar = proceduralAvatar("pi-ocarina", 5);
  for (let row = 0; row < 5; row += 1) assert.equal(avatar.slice(row * 5, row * 5 + 5), [...avatar.slice(row * 5, row * 5 + 5)].reverse().join(""));
});

test("animated avatar frames toggle one mirrored pair", () => {
  const [first, second] = proceduralAvatarFrames("thread-42");
  assert.equal(first.length, 25);
  assert.equal(second.length, 25);
  const changed = [...first].flatMap((cell, index) => cell === second[index] ? [] : [index]);
  assert.equal(changed.length, 2);
  assert.equal(changed[0]! % 5 + changed[1]! % 5, 4);
  assert.equal(Math.floor(changed[0]! / 5), Math.floor(changed[1]! / 5));
  assert.deepEqual(proceduralAvatarFrames("thread-42"), [first, second]);
});
