# Thread dashboard

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
- D6: `/` opens a telescope-style picker: a floating window with two
  panes. Left pane is an fzf input over the thread list. Right pane is
  a read-only preview of the highlighted thread. The input keeps focus;
  `ctrl-j`/`ctrl-k` or arrows move the highlight; `Enter` opens the
  thread as a strip column; `Esc` returns to the dashboard. The picker
  (input + list + preview slot) is one reusable component; thread
  search is its first user. Scope: this workspace's threads.
- D7: The preview never blocks input. On highlight change the pane
  responds on the same frame: a cached thread renders at once; an
  uncached one shows a skeleton loader while its replay runs in the
  background. No debounce. A replay that finishes for a row no longer
  highlighted fills the cache and does not repaint. The pane renders
  only the last 10 messages, pinned to the bottom, with an `earlier…`
  chip that renders the rest from cache. The cache is the existing
  `threads` state, so a revisited row is instant.
- D8: An opened thread replaces the dashboard column in place — same
  strip position, focus stays on that column. This holds for every
  path: first send (plain thread), the worktree flow, a recent row, and
  the picker. Opening two threads means `␣n` twice.
- D5: Leap works on the dashboard. The dashboard registers its body
  (`registerColumnBody`) and each recent row (`registerBlock`), so `s`
  plus two typed characters of a visible title lands the selection on
  that row. Leap selects; it does not open. `Enter` opens.

- D9: The first send in a dashboard column makes a plain thread. No
  worktree question is asked on send, from any path. A worktree exists
  only through `b`. The WorktreeAsk modal is removed entirely.

## Dashboard keys

| Key | Action |
| --- | --- |
| `i` | focus the composer; first send makes a plain thread |
| `b` | inline worktree flow: branch-name field, auto-focused |
| `/` | telescope picker over workspace thread history |
| `j` / `k` | move the selection bar over recent rows |
| `s` | leap onto a recent row by typing its visible text |
| `Enter` | open the selected recent row |
| `Esc` | leave the worktree field / clear the selection |

Digits keep switching workspaces. `w` keeps opening the switcher.

## Acceptance

- `␣n` shows a dashboard column and creates no backend thread.
- Closing a dashboard column with `␣x` leaves no orphan thread.
- A workspace with no history shows the actions without a recent list.
- The recent list never shows a thread that is open in the strip, so a
  reopen can never make a duplicate column.
- In the picker, typing and highlight movement never wait on a replay.
- Opening a thread from any path replaces the dashboard column in
  place, and the strip gains exactly one column.
- The WorktreeAsk modal no longer exists; `b` reaches the same
  worktree creation, with the same taken-name and failure reporting.
- The fresh-thread placeholder and `␣n` render the same component.

## Risks

- Leap on the dashboard depends on `registerBlock` working for
  non-thread rows; the drop-stale check in `blockFocus` must accept
  them.
- The preview replays whole threads; a very large thread lags its
  first preview. Accepted: cache and skeleton cover the common case,
  capping replays is backend work and out of scope.
- `threads.get` cache entries for previewed threads live for the
  session; memory grows with the number of previews. Accepted for now.
