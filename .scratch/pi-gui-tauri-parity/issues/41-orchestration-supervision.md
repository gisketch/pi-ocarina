# 41 — Orchestration supervision

**What to build:** Let users and orchestrator logic supervise child work through gates, bounded evidence, follow-ups, persistence, cancellation, and scheduled reconciliation.

**Blocked by:** 40 — Orchestration child-thread tools

**Status:** complete

- [x] Continue, stop, and wake gates drive one deterministic supervision state machine.
- [x] Evidence records distinguish report, acceptance, observation, and action with bounded retained history.
- [x] Supervision state survives restart and reconciles child status without duplicate actions.
- [x] Scheduled checks stop cleanly when complete/canceled and failures surface as failed observations rather than silent loops.

**Check:** `node_modules/node/bin/node --test agent-host/test/orchestration.test.js agent-host/test/supervision.test.js`.
