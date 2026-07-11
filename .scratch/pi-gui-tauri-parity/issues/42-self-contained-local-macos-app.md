# 42 — Self-contained local macOS app

**What to build:** Produce a locally launchable macOS app bundle that exercises real auth, native workspace access, bundled Pi, restart, and terminal behavior outside development.

**Blocked by:** 10 — Restart and running-session recovery; 24 — Integrated terminal; 29 — Provider credential settings; 33 — Extension discovery and management; 39 — Multi-window behavior

**Status:** in-progress

- [x] The app launches from Finder with a minimal Finder-style PATH and requires no system Node, Bun, or Pi.
- [x] Real upstream Pi auth and resource locations work without copying secrets into the bundle.
- [ ] Native picker, prompt/run, transcript reopen, dynamic extension, and PTY terminal pass in the packaged app.
- [ ] Application relaunch preserves valid app state and Pi sessions; signing, notarization, DMG, Homebrew, and updater are absent.
