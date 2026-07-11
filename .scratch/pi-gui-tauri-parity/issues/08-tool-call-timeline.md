# 08 — Tool-call timeline

**What to build:** Render Pi tool calls as first-class timeline items from start through result so users can inspect agent work.

**Blocked by:** 07 — Create thread and stream a real run

**Status:** complete

- [x] Tool start, progress, success, and failure events reconcile into one stable row.
- [x] Rows expose compact previews and accessible expand/collapse behavior.
- [x] Large or structured results stay bounded while preserving useful content.
- [x] A real Pi tool invocation is covered end to end (opt-in real-provider check; deterministic protocol coverage by default).
