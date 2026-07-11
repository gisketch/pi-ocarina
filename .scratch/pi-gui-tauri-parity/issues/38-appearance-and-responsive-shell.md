# 38 — Appearance and responsive shell

**What to build:** Provide persistent themes, transparency, sidebar controls, and compact responsive behavior using Radix primitives and Tailwind tokens.

**Blocked by:** 04 — Recoverable Rust app-state store; 12 — Workspace and thread navigation with drafts

**Status:** complete

- [x] Light and dark theme presets apply coordinated semantic tokens and survive restart.
- [x] Window transparency is optional, supported-state aware, and restorable.
- [x] Sidebar button and shortcut persist visibility while narrow windows keep collapsed content out of the layout.
- [x] Keyboard focus, reduced motion, contrast, and send-button visibility meet accessibility basics.
