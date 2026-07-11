# 37 — Notifications and attention state

**What to build:** Notify users only when background agent work completes, fails, or needs attention, with macOS permission state and in-app unread indicators kept consistent.

**Blocked by:** 28 — Parallel session runs

**Status:** ready-for-agent

- [ ] Permission is requested only after eligible work becomes backgrounded and only when a notification category is enabled.
- [ ] Focused selected sessions do not notify; background completion, failure, and attention states do.
- [ ] Denied, undecided, and enabled macOS states render distinct actions and refresh after System Settings.
- [ ] Selecting or refocusing the relevant thread clears its blue-dot attention state deterministically.

