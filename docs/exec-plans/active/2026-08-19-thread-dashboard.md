# Thread dashboard — tickets

Spec: [2026-08-19-thread-dashboard.md](../../specs/2026-08-19-thread-dashboard.md)

## T0 — prefactor: split the two oversized files this plan touches — `done`

Split `src/renderer/src/lib/keyboard.ts` (357) and
`src/renderer/src/lib/state/catalog.svelte.ts` (357) at real seams,
each under 350. No behavior change.

- Validation: full vitest green; `check-sonata` clean for these two.
- Blocked by: nothing.

## T1 — dashboard column, deferred creation — `done`

`␣n` spawns a dashboard column and calls no backend. FreshThread and
`␣n` render the same dashboard component. Rows drawn: `i` compose, `b`
and `/` as inert chips. First send creates the thread and replaces the
column in place (the worktree question still runs on send until T2).

- Acceptance: `␣n` then `␣x` leaves zero backend threads. First send
  yields one column at the same strip position.
- Validation: state tests through the real key path; eye test.
- Blocked by: T0.

## T2 — inline worktree flow, modal dies — `todo`

`b` swaps the dashboard middle for an auto-focused branch field,
reusing the `worktree-ask.svelte.ts` logic. Esc returns to the menu.
First send stops asking. `WorktreeAsk.svelte` and its wiring deleted.

- Acceptance: `b` + name + Enter makes a worktree thread that replaces
  the column. A taken or invalid name is refused under the field. No
  WorktreeAsk remains.
- Blocked by: T1.

## T3 — recent list + reopen in place — `todo`

Dashboard loads `listThreads`, filters out strip-open threads, shows
the 5 newest: title, relative time, status dot. `j`/`k` move the bar,
`Enter` opens. New catalog path reopens a thread by replacing the
dashboard column at its position.

- Acceptance: an open thread is never listed; Enter replaces in place,
  strip gains exactly one column; empty history shows actions only.
- Blocked by: T1.

## T4 — leap on dashboard rows — `todo`

Dashboard registers its body and rows (`registerColumnBody`,
`registerBlock`). `s` + typed visible text lands the selection on a
row. Leap selects; `Enter` opens.

- Blocked by: T3.

## T5 — telescope picker, `/` search — `todo`

Reusable floating picker: left pane fzf input + list, right pane a
slot. `/` opens it over the workspace's full thread history. Input
keeps focus; `ctrl-j`/`ctrl-k` (or arrows) move the highlight; Enter
opens in place; Esc returns. Right pane shows title/meta only here.

- Blocked by: T3.

## T6 — live preview pane — `todo`

Right pane previews the highlighted thread. Cached renders at once;
uncached shows a skeleton while the replay runs in the background. The
pane renders the last 10 messages pinned to the bottom, with an
`earlier…` chip that renders the rest from cache. A late replay for a
row no longer highlighted fills the cache without repainting. Input
never waits.

- Acceptance: typing during a replay stays snappy; a revisited row is
  instant.
- Blocked by: T5.
