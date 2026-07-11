# 07 — Create thread and stream a real run

**What to build:** Let a user create a local Pi thread, send a prompt, and watch the real assistant response stream into a durable timeline.

**Blocked by:** 06 — Shared Pi auth and model catalog

**Status:** ready-for-agent

- [ ] A new thread uses the selected workspace, model, and upstream Pi session manager.
- [ ] User and assistant messages appear incrementally without duplicate deltas.
- [ ] The completed transcript is backed by Pi-owned session data and reopens from that source.
- [ ] A real-provider test can be enabled explicitly while deterministic tests use a controlled adapter.

