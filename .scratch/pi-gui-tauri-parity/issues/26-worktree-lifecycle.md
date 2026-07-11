# 26 — Worktree lifecycle

**What to build:** Let users create isolated worktree-backed threads and safely clean them up without deleting unmerged work.

**Blocked by:** 05 — Native workspace catalog; 12 — Workspace and thread navigation with drafts

**Status:** complete

- [x] Creating a worktree provisions a linked workspace and thread and selects it only after success.
- [x] Failed thread creation rolls back the new worktree and branch.
- [x] Removal deletes a merged generated branch but preserves dirty or unmerged work with a clear refusal.
- [x] Orphan pruning removes only clean unreferenced worktrees and keeps referenced or dirty ones visible.
