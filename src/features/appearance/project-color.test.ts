import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_COLORS, projectColor, projectColorVariables, setProjectPalette } from "./project-color.js";

function luminance(hex: string) {
  const channels = hex.match(/[\da-f]{2}/gi)!.map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

test("project colors are stable and inherited by worktrees", () => {
  const root = { id: "project-a", name: "Before" };
  const renamed = { ...root, name: "After" };
  const worktree = { id: "worktree-a", root_workspace_id: root.id };
  assert.deepEqual(projectColor(root), projectColor(renamed));
  assert.deepEqual(projectColor(root), projectColor(worktree));
  assert.ok(PROJECT_COLORS.some(({ name }) => name === projectColor(root).name));
});

test("custom palette preserves stable slots", () => {
  const workspace = { id: "project-a" };
  const slot = PROJECT_COLORS.findIndex(({ name }) => name === projectColor(workspace).name);
  const palette: string[] = PROJECT_COLORS.map(({ primary }) => primary);
  palette[slot] = "#ffffff";
  setProjectPalette(palette);
  assert.equal(projectColor(workspace).primary, "#ffffff");
  assert.equal(projectColor(workspace).foreground, "#020203");
  setProjectPalette();
});

test("project palette has readable foreground contrast", () => {
  for (const color of PROJECT_COLORS) {
    const lighter = Math.max(luminance(color.primary), luminance(color.foreground));
    const darker = Math.min(luminance(color.primary), luminance(color.foreground));
    assert.ok((lighter + 0.05) / (darker + 0.05) >= 4.5, color.name);
  }
});

test("project scope overrides source and resolved theme aliases", () => {
  const color = PROJECT_COLORS[2];
  assert.deepEqual(projectColorVariables(color), {
    "--pb-primary": color.primary,
    "--pb-primary-foreground": color.foreground,
    "--primary": color.primary,
    "--primary-foreground": color.foreground,
    "--ring": color.primary,
    "--sidebar-primary": color.primary,
    "--sidebar-primary-foreground": color.foreground,
    "--sidebar-ring": color.primary,
  });
});
