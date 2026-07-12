import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("glowing icons render an unmasked blur wrapper behind the crisp shape", () => {
  return readFile(new URL("./icon.tsx", import.meta.url), "utf8").then((source) => {
    assert.match(source, /data-icon-glow/);
    assert.match(source, /filter: "blur\(3px\)"/);
  });
});
