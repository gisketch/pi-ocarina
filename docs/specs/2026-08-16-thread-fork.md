# Fork a thread at a checkpoint

Status: **NEED GRILLING.** High-level. Not an approved contract.

## Problem

Checkpoint restore throws away the future. A reader who wants to try a second
answer to the same question must destroy the first one to do it, and cannot
compare them afterwards.

The hard part is already built. `B6` restores a session to a checkpoint, and the
block menu already offers it on the message the checkpoint belongs to.

## Desired outcome

A reader forks at a checkpoint. Two threads then exist: the original, untouched,
and a copy that continues from that point. The strip shows both.

## In scope

- Forking a session at a checkpoint into a second thread.
- What the new thread inherits: history, model, working directory, worktree.
- How the strip and the catalog present a pair of related threads.

## Out of scope

- Comparing two threads side by side beyond putting them in adjacent columns.
- Merging two forks back together.
- Forking a terminal column.

## Acceptance behavior

- `a` on a message with a checkpoint offers fork next to restore.
- The fork opens as a new column, focused, carrying the history up to that point.
- The original thread is unchanged, including its blocks after the fork point.
- Closing either thread leaves the other one working.
- A fork of a running thread is refused, or waits — the grill decides which.

## Constraints

- Session identity lives in the catalog. A fork is a new session, never a second
  view of one session.
- pi owns session storage. Whether it can copy a session at a checkpoint decides
  whether this is cheap or expensive.
- The block menu is already the place a reader acts on a block. Fork belongs
  there, not in a new surface.

## Validation

- Catalog tests: a fork appears, both sessions resume after a restart.
- A live pass with pi, gated the way the existing live tests are.

## Questions the grill must answer

1. Can pi copy a session at a checkpoint, or must PiOcarina replay the history
   into a new one?
2. Does a fork inherit the parent's worktree, or need its own?
3. How does a reader see that two threads are related — a name, a mark, a
   position in the strip?
4. What happens to a fork when its parent is closed or deleted?
5. Does the fork start with the parent's next prompt, or wait for a new one?
