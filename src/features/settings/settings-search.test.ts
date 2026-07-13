import assert from "node:assert/strict";
import test from "node:test";
import { matchingSettings } from "./settings-search";

const settings = [{ id: "sidebar", label: "Sidebar", description: "Show workspace navigation" }, { id: "transparency", label: "Translucent surfaces", description: "macOS window appearance" }];

test("settings search matches labels and descriptions", () => {
  assert.deepEqual(matchingSettings(settings, "side").map(({ id }) => id), ["sidebar"]);
  assert.deepEqual(matchingSettings(settings, "macos").map(({ id }) => id), ["transparency"]);
  assert.equal(matchingSettings(settings, "missing").length, 0);
  assert.equal(matchingSettings(settings, "").length, 2);
});
