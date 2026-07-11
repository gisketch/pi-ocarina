# 40 — Orchestration child-thread tools

**What to build:** Expose built-in Pi tools that let an orchestrator create, list, read, and message child threads with live status and transcript summaries.

**Blocked by:** 28 — Parallel session runs; 33 — Extension discovery and management

**Status:** complete

- [x] Create-child produces a valid isolated Pi session associated with the parent.
- [x] List and read return only threads visible to the requesting orchestrator scope.
- [x] Messages and follow-ups reach the intended child and report queued, running, waiting, completed, failed, or canceled status.
- [x] Canceling a parent cancels its active children; completed and waiting children remain intact.

**Check:** `node_modules/node/bin/node --test agent-host/test/orchestration.test.js agent-host/test/protocol.test.js`.
