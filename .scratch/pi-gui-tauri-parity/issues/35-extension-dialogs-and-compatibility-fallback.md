# 35 — Extension dialogs and compatibility fallback

**What to build:** Bridge supported extension prompts and editor requests into native React dialogs while failing unsupported terminal-only UI quickly and consistently.

**Blocked by:** 34 — Extension dock UI

**Status:** ready-for-agent

- [ ] Supported select, confirm, input, editor, and notification requests resolve only the requesting session.
- [ ] Dialog-producing packages do not block session startup or unrelated windows.
- [ ] Unsupported terminal-only custom UI fails before stray messages are submitted and is labeled clearly.
- [ ] Learned compatibility status persists and can recover after extension changes.

