import assert from "node:assert/strict";
import test from "node:test";

import { isBottomPinned } from "./transcript-scroll.js";

test("bottom pinning tolerates small layout drift but preserves off-bottom reading", () => {
  assert.equal(isBottomPinned({ scrollHeight: 1000, clientHeight: 200, scrollTop: 780 }), true);
  assert.equal(isBottomPinned({ scrollHeight: 1000, clientHeight: 200, scrollTop: 700 }), false);
});
