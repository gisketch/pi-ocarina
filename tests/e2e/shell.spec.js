describe("desktop shell", () => {
  it("launches the real Tauri app and exposes its ready state", async () => {
    const shell = await browser.$('[data-testid="app-ready"]');

    await shell.waitForDisplayed();
    await expect(shell).toHaveText(expect.stringContaining("Pi Ocarina"));
  });
});
