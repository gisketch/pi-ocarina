import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const composerSelector = '[contenteditable="true"][aria-label="Message"]';

function writeClipboard(value: string) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn("pbcopy");
    process.on("error", reject);
    process.on("close", (code) => code === 0 ? resolve() : reject(new Error(`pbcopy exited with ${code}`)));
    process.stdin.end(value);
  });
}

declare global {
  interface Window {
    __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown> };
    __draftWriteCount: number;
  }
}

describe("desktop shell", () => {
  it("launches the real Tauri app and exposes its ready state", async () => {
    const shell = await browser.$('[data-testid="app-ready"]');

    await shell.waitForDisplayed();
    await expect(shell).toHaveText(expect.stringContaining("PiOcarina"));
    await expect(browser.$('[data-testid="runtime-status"]')).toHaveText("Bundled Pi ready");
  });

  it("adds and selects a canonical workspace through the Rust catalog", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "pi-ocarina-workspace-"));
    const skillDir = join(workspace, ".agents", "skills", "palette-proof-skill");
    const extensionDir = join(workspace, ".pi", "extensions");
    await mkdir(skillDir, { recursive: true });
    await mkdir(extensionDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: palette-proof-skill\ndescription: Palette proof skill\n---\n\n# Proof\n");
    await writeFile(join(extensionDir, "palette-proof.js"), "export default function (pi) { pi.registerCommand('palette-proof-command', { description: 'Palette proof command', handler: async () => {} }); }\n");
    let workspaceId = "";
    try {
      workspaceId = await browser.execute(async (path) => {
        const state = await window.__TAURI_INTERNALS__.invoke("add_workspace", { path }) as { workspaces: Array<{ id: string; path: string }> };
        const folder = path.split("/").filter(Boolean).at(-1);
        const id = state.workspaces.find((item) => item.path.split("/").filter(Boolean).at(-1) === folder)?.id;
        if (!id) throw new Error("Added workspace missing from catalog");
        await window.__TAURI_INTERNALS__.invoke("select_workspace", { workspaceId: id });
        return id;
      }, workspace);
      const selected = await browser.execute(async (id) => {
        const snapshot = await window.__TAURI_INTERNALS__.invoke("app_state_snapshot") as { state: { workspaces: Array<{ id: string }>; windows: Record<string, { workspace_id?: string }> } };
        return snapshot.state.workspaces.some((item) => item.id === id) && Object.values(snapshot.state.windows).some((item) => item.workspace_id === id);
      }, workspaceId);
      expect(selected).toBe(true);
      await expect(browser.$('[data-testid="model-catalog"]')).toBeDisplayed();
      await expect(browser.$('button*=Settings')).toBeDisplayed();
      const composer = await browser.$(composerSelector);
      await composer.setValue("$palette-proof");
      await expect(browser.$('[role="listbox"][aria-label="Skills"]')).toHaveText(expect.stringContaining("palette-proof-skill"));
      await composer.setValue("/palette-proof");
      await expect(browser.$('[role="listbox"][aria-label="Slash commands"]')).toHaveText(expect.stringContaining("palette-proof-command"));
    } finally {
      if (workspaceId) await browser.execute((id) => window.__TAURI_INTERNALS__.invoke("remove_workspace", { workspaceId: id }), workspaceId);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps rapid composer input responsive and coalesces durable draft writes", async () => {
    await browser.execute(() => {
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__draftWriteCount = 0;
      window.__TAURI_INTERNALS__.invoke = (command: string, args?: Record<string, unknown>, options?: unknown) => {
        if (command === "set_workspace_projection") window.__draftWriteCount += 1;
        return original(command, args, options);
      };
    });
    const composer = await browser.$(composerSelector);
    const text = "responsive typing should not persist every individual character";
    const started = Date.now();
    await composer.setValue(text);
    const elapsed = Date.now() - started;
    await browser.pause(500);
    await expect(composer).toHaveText(text);
    expect(elapsed).toBeLessThan(3000);
    expect(await browser.execute(() => window.__draftWriteCount)).toBeLessThanOrEqual(2);
  });

  it("supports native composer copy, cut, and paste shortcuts", async () => {
    const composer = await browser.$(composerSelector);
    await composer.setValue("clipboard draft");
    await expect(composer).toHaveText("clipboard draft");
    await composer.click();
    await browser.keys(["\uE03D", "a", "\uE000", "\uE03D", "c", "\uE000"]);
    expect((await execFile("pbpaste")).stdout).toBe("clipboard draft");

    await browser.keys(["\uE03D", "x", "\uE000"]);
    await expect(composer).toHaveText("");

    await writeClipboard("pasted draft");
    await browser.keys(["\uE03D", "v", "\uE000"]);
    await expect(composer).toHaveText("pasted draft");
  });

  it("opens and closes the native Changes pane from the titlebar", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "pi-ocarina-review-"));
    let workspaceId = "";
    try {
      await execFile("git", ["init"], { cwd: workspace });
      await writeFile(join(workspace, "sample.ts"), "export const value = 1;\n");
      await execFile("git", ["add", "sample.ts"], { cwd: workspace });
      await execFile("git", ["-c", "user.name=Pi Ocarina", "-c", "user.email=pi@example.invalid", "commit", "-m", "fixture"], { cwd: workspace });
      await writeFile(join(workspace, "sample.ts"), "export const value = 2;\n");
      workspaceId = await browser.execute(async (path) => {
        const state = await window.__TAURI_INTERNALS__.invoke("add_workspace", { path }) as { workspaces: Array<{ id: string; path: string }> };
        const folder = path.split("/").filter(Boolean).at(-1);
        const id = state.workspaces.find((item) => item.path.split("/").filter(Boolean).at(-1) === folder)?.id;
        if (!id) throw new Error("Review workspace missing from catalog");
        await window.__TAURI_INTERNALS__.invoke("select_workspace", { workspaceId: id });
        return id;
      }, workspace);
      const toggle = await browser.$('button[aria-label="Show Changes"]');
      await toggle.waitForDisplayed();
      await toggle.click();
      const workbench = await browser.$('aside[aria-label="Review workbench"]');
      await workbench.waitForDisplayed();
      await expect(workbench).toHaveText(expect.stringContaining("sample.ts"));
      await expect(browser.$('[role="separator"]')).toBeDisplayed();
      await expect(browser.$('button[aria-label="Hide file tree"]')).toBeDisplayed();
      await browser.$('button[aria-label="Hide file tree"]').click();
      await expect(browser.$('button[aria-label="Show file tree"]')).toBeDisplayed();
      await expect(browser.$('aside.pb-review-tree')).not.toBeDisplayed();
      await browser.$('button[aria-label="Show file tree"]').click();
      await expect(browser.$('aside.pb-review-tree')).toBeDisplayed();
      await expect(browser.$('[aria-label="Resize file tree"]')).toBeDisplayed();
      await browser.$('button[aria-label="Hide Changes"]').click();
      await workbench.waitForDisplayed({ reverse: true });
      await expect(browser.$('button[aria-label="Show Changes"]')).toBeDisplayed();
    } finally {
      if (workspaceId) await browser.execute((id) => window.__TAURI_INTERNALS__.invoke("remove_workspace", { workspaceId: id }), workspaceId);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("opens Settings and returns to the preserved composer", async () => {
    const composer = await browser.$(composerSelector);
    await composer.setValue("preserve this settings draft");
    await browser.$('button*=Settings').click();
    await expect(browser.$('section[aria-label="Settings"]')).toBeDisplayed();
    await expect(browser.$('[data-testid="workspace-layer"]')).not.toBeDisplayed();
    await expect(browser.$('h1=General')).toBeDisplayed();
    await browser.$('button=Appearance').click();
    await expect(browser.$('h1=Appearance')).toBeDisplayed();
    await expect(browser.$('input[role="combobox"][aria-label="Application font"]')).toBeDisplayed();
    expect(await browser.execute(async () => ((await window.__TAURI_INTERNALS__.invoke("system_font_families")) as { families: string[] }).families.length)).toBeGreaterThan(0);
    await browser.$('button=Providers').click();
    await expect(browser.$('h1=Providers')).toBeDisplayed();
    await browser.$('button=Notifications').click();
    await expect(browser.$('h1=Notifications')).toBeDisplayed();
    const search = await browser.$('input[aria-label="Search settings"]');
    await search.setValue("background brightness");
    await expect(browser.$('h1=Appearance')).toBeDisplayed();
    await expect(browser.$('input[aria-label="Background brightness"]')).toBeDisplayed();
    await browser.$('button*=Back to app').click();
    await expect(browser.$('[data-testid="workspace-layer"]')).toBeDisplayed();
    await expect(composer).toBeDisplayed();
    await expect(composer).toHaveText("preserve this settings draft");
  });

  it("opens an independent second Tauri window", async () => {
    await browser.execute(() => window.__TAURI_INTERNALS__.invoke("open_app_window"));
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2);
    const handles = await browser.getWindowHandles();
    const second = handles[1];
    const first = handles[0];
    if (!second || !first) throw new Error("Expected two app windows");
    await browser.switchToWindow(second);
    await expect(browser.$('[data-testid="app-ready"]')).toBeDisplayed();
    await browser.closeWindow();
    await browser.switchToWindow(first);
  });
});
