# 26 — Worktree lifecycle

**What to build:** Let users create isolated worktree-backed threads and safely clean them up without deleting unmerged work.

**Blocked by:** 05 — Native workspace catalog; 12 — Workspace and thread navigation with drafts

**Status:** ready-for-agent

- [ ] Creating a worktree provisions a linked workspace and thread and selects it only after success.
- [ ] Failed thread creation rolls back the new worktree and branch.
- [ ] Removal deletes a merged generated branch but preserves dirty or unmerged work with a clear refusal.
- [ ] Orphan pruning removes only clean unreferenced worktrees and keeps referenced or dirty ones visible.

