import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

declare global {
  interface Window {
    __TAURI__: { core: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } };
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
    let workspaceId = "";
    try {
      workspaceId = await browser.execute(async (path) => {
        const state = await window.__TAURI__.core.invoke("add_workspace", { path }) as { workspaces: Array<{ id: string; path: string }> };
        const folder = path.split("/").filter(Boolean).at(-1);
        const id = state.workspaces.find((item) => item.path.split("/").filter(Boolean).at(-1) === folder)?.id;
        if (!id) throw new Error("Added workspace missing from catalog");
        await window.__TAURI__.core.invoke("select_workspace", { workspaceId: id });
        return id;
      }, workspace);
      const selected = await browser.execute(async (id) => {
        const snapshot = await window.__TAURI__.core.invoke("app_state_snapshot") as { state: { workspaces: Array<{ id: string }>; windows: Record<string, { workspace_id?: string }> } };
        return snapshot.state.workspaces.some((item) => item.id === id) && Object.values(snapshot.state.windows).some((item) => item.workspace_id === id);
      }, workspaceId);
      expect(selected).toBe(true);
      await expect(browser.$('[data-testid="model-catalog"]')).toHaveText(expect.stringContaining("providers"));
    } finally {
      if (workspaceId) await browser.execute((id) => window.__TAURI__.core.invoke("remove_workspace", { workspaceId: id }), workspaceId);
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
    const composer = await browser.$('textarea[aria-label="Message"]');
    const text = "responsive typing should not persist every individual character";
    const started = Date.now();
    await composer.setValue(text);
    const elapsed = Date.now() - started;
    await browser.pause(500);
    await expect(composer).toHaveValue(text);
    expect(elapsed).toBeLessThan(3000);
    expect(await browser.execute(() => window.__draftWriteCount)).toBeLessThanOrEqual(2);
  });

  it("opens an independent second Tauri window", async () => {
    await browser.execute(() => window.__TAURI__.core.invoke("open_app_window"));
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
