# 05 — Native workspace catalog

**What to build:** Let users add, select, and reopen local workspaces through native macOS folder selection while Rust owns the catalog.

**Blocked by:** 03 — Versioned Rust-agent-host bridge; 04 — Recoverable Rust app-state store

**Status:** complete

- [x] The empty state, Command-O, and File menu use one native open-folder action.
- [x] Canceling the picker changes nothing; accepting a folder adds and selects one canonical workspace.
- [x] Workspace selection and catalog order survive restart.
- [x] All parity rows assigned to Ticket 05 pass in a real Tauri surface.
