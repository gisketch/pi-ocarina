# 40 — Orchestration child-thread tools

**What to build:** Expose built-in Pi tools that let an orchestrator create, list, read, and message child threads with live status and transcript summaries.

**Blocked by:** 28 — Parallel session runs; 33 — Extension discovery and management

**Status:** ready-for-agent

- [ ] Create-child produces a valid isolated Pi session associated with the parent.
- [ ] List and read return only threads visible to the requesting orchestrator scope.
- [ ] Messages and follow-ups reach the intended child and report queued, running, waiting, completed, failed, or canceled status.
- [ ] Canceling a parent handles active children according to one safe documented policy.

