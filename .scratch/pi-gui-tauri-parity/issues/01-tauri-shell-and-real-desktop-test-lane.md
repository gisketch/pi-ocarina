# 01 — Tauri shell and real-desktop test lane

**What to build:** Launch a minimal Tauri 2 desktop shell whose React JavaScript surface can be driven by a real-desktop smoke test, establishing the executable foundation for every later flow.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] The app launches through Tauri in development and shows a stable, accessible shell rather than a browser-only mock.
- [ ] A deterministic real-desktop smoke opens the app, observes readiness, and exits cleanly.
- [ ] Bun scripts run frontend checks and Rust format, lint, test, and build checks from the repository root.
- [ ] All parity rows assigned to Ticket 01 have runnable acceptance coverage.

