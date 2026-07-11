# 10 — Restart and running-session recovery

**What to build:** Restore workspaces, selected thread, transcript, drafts, and run status after application restart, including sessions that continue producing Pi events.

**Blocked by:** 04 — Recoverable Rust app-state store; 07 — Create thread and stream a real run; 09 — Stop, failure, and runtime prompts

**Status:** ready-for-agent

- [ ] Restart restores the last valid workspace and thread selection.
- [ ] Pi-owned transcripts are reread rather than restored from a duplicate app transcript.
- [ ] An active or recently active session reconciles new events without duplication or false running state.
- [ ] Missing sessions and interrupted hosts degrade to a clear recoverable state.

