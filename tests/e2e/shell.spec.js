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

  it("keeps rapid composer input responsive and coalesces durable draft writes", async () => {
    await browser.execute(() => {
      const original = window.__TAURI_INTERNALS__.invoke;
      window.__draftWriteCount = 0;
      window.__TAURI_INTERNALS__.invoke = (command, args, options) => {
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
    await browser.switchToWindow(handles[1]);
    await expect(browser.$('[data-testid="app-ready"]')).toBeDisplayed();
    await browser.closeWindow();
    await browser.switchToWindow(handles[0]);
  });
});
