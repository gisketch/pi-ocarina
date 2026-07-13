import assert from "node:assert/strict";
import test from "node:test";

import { noticePresentation } from "./extension-runtime-ui-model";

test("extension notices preserve severity and accessible roles", () => {
  assert.deepEqual(noticePresentation("info"), { className: "border-border bg-muted text-foreground", role: "status" });
  assert.match(noticePresentation("warning").className, /amber/);
  assert.equal(noticePresentation("error").role, "alert");
});
