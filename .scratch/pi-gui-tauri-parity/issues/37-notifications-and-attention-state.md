# 37 — Notifications and attention state

**What to build:** Notify users only when background agent work completes, fails, or needs attention, with macOS permission state and in-app unread indicators kept consistent.

**Blocked by:** 28 — Parallel session runs

**Status:** complete

- [x] Permission is requested only after eligible work becomes backgrounded and only when a notification category is enabled.
- [x] Focused selected sessions do not notify; background completion, failure, and attention states do.
- [x] Denied, undecided, and enabled macOS states render distinct actions and refresh after System Settings.
- [x] Selecting or refocusing the relevant thread clears its blue-dot attention state deterministically.

**Checks:** `node_modules/node/bin/node --test src/features/notifications/notification-policy.test.js`; `bun run typecheck`; real Tauri E2E.
