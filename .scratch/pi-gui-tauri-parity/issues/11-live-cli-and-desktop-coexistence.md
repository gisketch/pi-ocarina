# 11 — Live CLI and desktop coexistence

**What to build:** Keep desktop state synchronized with Pi CLI activity while preventing two processes from writing the same session concurrently.

**Blocked by:** 10 — Restart and running-session recovery

**Status:** ready-for-agent

- [ ] CLI-created sessions and externally appended messages appear after bounded refresh triggers.
- [ ] A single-writer lease prevents simultaneous active writers and permits safe stale-lease takeover.
- [ ] External changes never overwrite an unsaved composer draft or app preference.
- [ ] Sessions written by a newer unsupported Pi schema show a per-session dismissible warning and remain read-only when required.

