# 02 — Self-contained upstream Pi packaging proof

**What to build:** Prove the desktop can ship upstream Pi inside the application and execute it without relying on a user-installed Node, Bun, Pi, or the Earendil fork.

**Blocked by:** 01 — Tauri shell and real-desktop test lane

**Status:** complete

- [x] The agent host runs pinned @mariozechner/pi-coding-agent 0.73.1 on a bundled Node 20 runtime.
- [x] A locally packaged app starts the host and completes one real SDK request with no supported runtime on PATH.
- [x] A dynamically discovered Pi extension loads from the normal upstream resource locations.
- [x] Missing or incompatible bundled runtime failures are explicit and leave user data untouched.
