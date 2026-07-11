# 41 — Orchestration supervision

**What to build:** Let users and orchestrator logic supervise child work through gates, bounded evidence, follow-ups, persistence, cancellation, and scheduled reconciliation.

**Blocked by:** 40 — Orchestration child-thread tools

**Status:** ready-for-agent

- [ ] Continue, stop, and wake gates drive one deterministic supervision state machine.
- [ ] Evidence records distinguish report, acceptance, observation, and action with bounded retained history.
- [ ] Supervision state survives restart and reconciles child status without duplicate actions.
- [ ] Scheduled checks stop cleanly when complete/canceled and failures surface as attention rather than silent loops.

