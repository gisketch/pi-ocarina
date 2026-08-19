# Thread dashboard (grill in progress)

## Problem

Closed threads exist in the backend. No UI can find them or reopen them.
`␣n` creates a backend thread before the reader chooses anything, so an
abandoned `␣n` leaves an orphan thread. The fresh-thread placeholder and
`␣n` create threads through two different paths.

## Direction (settled so far)

- The fresh-thread placeholder column becomes a dashboard. `␣n` spawns it.
- The dashboard creates nothing until the reader chooses.
- Choices on the dashboard: compose a plain thread, make a worktree
  thread, search history, reopen a recent thread.
- Every thread opened from the dashboard is a normal strip column.
  There is no ephemeral state.
- `␣x` hides a column from the strip. The backend keeps the thread.
  (This is already true in code.)
- The WorktreeAsk modal is removed. The worktree question moves onto the
  dashboard.

## Decisions

- D1: `␣n` defers creation. The dashboard column itself creates no
  backend thread. A thread is born only by: first send (plain), the
  worktree flow, or picking a thread from recent/search.
- D2: The worktree flow is inline. `b` swaps the dashboard's middle for
  a branch-name field, auto-focused. Esc returns to the menu. The state
  logic in `worktree-ask.svelte.ts` (taken-name check, pending state,
  failure text) is reused; only the modal shell is removed.
- D3: The worktree key is `b` (branch). `w` stays the switcher
  everywhere. One key, one meaning.
- D4: The recent list shows 5 threads from this workspace only, newest
  activity first. Threads already open in the strip are excluded, so a
  reopen can never make a duplicate column. Row shows title, relative
  time, status dot. `j`/`k` move a selection bar; `Enter` opens. Digits
  are not used — bare digits switch workspaces globally and must keep
  doing so.
- D5: Leap works on the dashboard. The dashboard registers its body
  (`registerColumnBody`) and each recent row (`registerBlock`), so `s`
  plus two typed characters of a visible title lands the selection on
  that row. Leap selects; it does not open. `Enter` opens.

## Open

- How the worktree flow renders on the dashboard.
- Recent list: count, scope, ordering, keys.
- Search: scope and overlay reuse.
- Keys: `i`, `w`, `/`, digits — final map.
- What happens to `new-thread.ts` / first-send path.
