import assert from "node:assert/strict";
import test from "node:test";
import { appearanceColorVariables, appearanceFontVariables, invalidAppearancePreference, normalizeAppearancePreferences } from "./appearance-preferences";

test("font preferences map only through semantic typography roles", () => {
  const variables = appearanceFontVariables({ application_font: "SF Pro Text", code_font: "Berkeley Mono" });
  assert.equal(variables["--pb-font-prose"], '"SF Pro Text", ui-sans-serif, sans-serif');
  assert.equal(variables["--pb-font-heading"], '"Berkeley Mono", ui-monospace, monospace');
  assert.deepEqual(appearanceFontVariables({ application_font: null, code_font: null }), {});
});

test("invalid persisted appearance values fall back safely", () => {
  const normalized = normalizeAppearancePreferences({ theme: "dark", transparency: false, sidebar_visible: true, application_font: "\n", interface_accent: "red", background_brightness: 100, project_palette: ["#ffffff"] });
  assert.equal(normalized.application_font, null);
  assert.equal(normalized.interface_accent, null);
  assert.equal(normalized.background_brightness, 28);
  assert.deepEqual(normalized.project_palette, []);
  assert.equal(invalidAppearancePreference({ theme: "dark", transparency: false, sidebar_visible: true, interface_accent: "red" }), true);
});

test("background brightness preserves ordered dark surfaces", () => {
  const variables = appearanceColorVariables({ interface_accent: "#abcdef", background_brightness: 10 });
  assert.equal(variables["--pb-background"], "rgb(12 12 13)");
  assert.equal(variables["--pb-noisy-surface-background"], "rgb(15 15 16)");
  assert.equal(variables["--pb-primary"], "#abcdef");
});
