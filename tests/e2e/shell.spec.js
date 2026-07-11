import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("desktop shell", () => {
  it("launches the real Tauri app and exposes its ready state", async () => {
    const shell = await browser.$('[data-testid="app-ready"]');

    await shell.waitForDisplayed();
    await expect(shell).toHaveText(expect.stringContaining("Pi Ocarina"));
    await expect(browser.$('[data-testid="runtime-status"]')).toHaveText("Bundled Pi ready");
  });

  it("adds and selects a canonical workspace through the Rust catalog", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "pi-ocarina-workspace-"));
    await browser.execute((path) => window.__TAURI__.core.invoke("add_workspace", { path }), workspace);

    await expect(browser.$(`button*=${workspace.split("/").at(-1)}`)).toBeDisplayed();
    await expect(browser.$('[data-testid="model-catalog"]')).toHaveText(expect.stringContaining("providers"));
  });

  it("opens an independent second Tauri window", async () => {
    await browser.execute(() => window.__TAURI__.core.invoke("open_app_window"));
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2);
    const handles = await browser.getWindowHandles();
    await browser.switchToWindow(handles[1]);
    await expect(browser.$('[data-testid="app-ready"]')).toBeDisplayed();
    await browser.closeWindow();
    await browser.switchToWindow(handles[0]);
  });
});
