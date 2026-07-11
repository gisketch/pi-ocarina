import assert from "node:assert/strict";
import test from "node:test";

import { blockedCommand } from "./compatibility.js";

test("learned terminal-only commands fail before submission", () => {
  const command = { name: "handoff", source: "extension", extensionPath: "/ext.js" };
  const record = { message: "Terminal-only custom UI" };
  assert.equal(blockedCommand("/handoff now", [command], { "/ext.js::handoff": record }), record);
  assert.equal(blockedCommand("normal prompt", [command], { "/ext.js::handoff": record }), undefined);
});
