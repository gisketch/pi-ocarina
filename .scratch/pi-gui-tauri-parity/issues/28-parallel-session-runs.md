# 28 — Parallel session runs

**What to build:** Run multiple Pi sessions concurrently without status, events, prompts, or composer state bleeding between them.

**Blocked by:** 10 — Restart and running-session recovery; 15 — Queue and steer active runs

**Status:** complete

- [x] At least two sessions stream concurrently with isolated transcripts and status.
- [x] Switching among running sessions stays responsive and does not pause background work.
- [x] Stop, queue, steer, dialogs, and failures target only the intended session.
- [x] Completion ordering cannot overwrite newer selected-thread state.
