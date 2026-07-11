# 27 — Repository model scope

**What to build:** Allow model preferences to be global or repository-scoped, with worktrees inheriting from their root repository.

**Blocked by:** 06 — Shared Pi auth and model catalog; 26 — Worktree lifecycle

**Status:** complete

- [x] Users can switch between global and per-repository model scope.
- [x] Repository choices persist without modifying unrelated Pi provider data.
- [x] Worktree threads inherit root repository settings unless an explicit supported override exists.
- [x] Invalid or removed models recover through the same onboarding flow as normal threads.
