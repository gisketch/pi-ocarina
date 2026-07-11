# 04 — Recoverable Rust app-state store

**What to build:** Persist app-owned workspaces, selections, preferences, and window projections in Rust without duplicating Pi transcripts or credentials.

**Blocked by:** 01 — Tauri shell and real-desktop test lane

**Status:** done

- [x] App-owned state is written atomically and restored after restart.
- [x] A corrupt primary state file recovers from the last valid backup and reports recovery without losing Pi sessions.
- [x] State schema versions migrate deterministically and reject unsupported future versions safely.
- [x] Multiple windows receive consistent projections without making a renderer authoritative.
