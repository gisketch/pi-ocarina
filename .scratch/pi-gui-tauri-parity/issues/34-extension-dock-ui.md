# 34 — Extension dock UI

**What to build:** Render supported extension status, widget, and title output in a compact session-scoped composer dock.

**Blocked by:** 33 — Extension discovery and management

**Status:** complete

- [x] One dock per session stays collapsed by default and expands to bounded accessible content.
- [x] Status-only and widget-only output receives literal fallback summaries.
- [x] Repeated widget updates replace state instead of spamming the transcript.
- [x] Dock state, title, and widgets never bleed between concurrent sessions.
