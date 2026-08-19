# Fork a thread at a checkpoint

Status: **grilled 2026-08-19.** Decisions D1–D6 settled; awaiting implementation.

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

## Decisions

- D1: pi copies the session natively. `SessionManager.createBranchedSession(leafId)`
  writes a new session file with only the root-to-leaf path, in the same session
  directory, with a `parentSessionPath` header pointing at the parent. Our
  `checkpointId` is an entry id, so it is the leaf argument directly. No replay,
  no token cost. Two behaviors found during implementation, pinned by
  `fork-session.test.ts`: the call **mutates the manager it is called on** into
  the fork, so it must run on a second manager opened over the parent's file,
  never the live parent's own; and a fork whose path holds no assistant message
  is not written to disk until the first assistant reply, so a fork abandoned
  before its first send leaves nothing behind.
- D2: The fork shares the parent's folder, worktree included — the mechanism's
  own default (`createBranchedSession` keeps the parent's cwd). Fork is a
  compare-conversations tool; a reader who wants isolation makes a worktree
  thread from the dashboard. Accepted risk: two forks running at once can
  collide on file edits.
- D3: A fork is allowed at any time, running or idle. pi's session is an
  append-only tree: a running turn appends after the current leaf, and the
  root-to-checkpoint path never changes, so the copy reads frozen history. No
  gate, no wait state, no refusal.
- D4: Relation shown by position and name. The fork opens as a column directly
  right of the parent, focused. Its title is the parent's title prefixed with
  `Fork - `. The mark lives in the title string, so the strip, recent list and
  picker all show it with zero backend change. No lineage UI; pi's
  `parentSessionPath` header stays on disk if that is ever wanted.
- D5 (fact, not a choice): a fork survives its parent. The copy is a complete,
  independent session file; `parentSessionPath` is an inert string. Closing
  (archiving) the parent changes nothing in the fork. The app has no hard
  delete today.
- D6: The fork waits for a new prompt. It opens showing the history up to the
  checkpoint with the composer focused and empty — the same posture restore
  leaves a thread in. No prompt is re-sent and no tokens are spent until the
  reader types.

## Acceptance behavior

- `a` on a message with a checkpoint offers fork next to restore.
- The fork opens as a new column directly right of the parent, focused,
  carrying the history up to the checkpoint.
- The fork's title is the parent's title prefixed with `Fork - `.
- The fork's composer is focused and empty; nothing runs until the reader
  sends.
- The original thread is unchanged, including its blocks after the fork point.
- Forking works while the parent's turn is running.
- Closing either thread leaves the other one working; both survive a restart.

## Constraints

- Session identity lives in the catalog. A fork is a new session, never a second
  view of one session.
- pi owns session storage; the copy goes through `createBranchedSession`, never
  a hand-rolled file copy.
- The block menu is already the place a reader acts on a block. Fork belongs
  there, not in a new surface.

## Validation

- Catalog tests: a fork appears at the right position with the right title,
  both sessions resume after a restart.
- Backend test: fork of a session file yields a session whose replay ends at
  the checkpoint and whose parent is untouched.
- A live pass with pi, gated the way the existing live tests are.

## Risks

- Two forks sharing one folder can collide on file edits when both run
  (accepted in D2).
- `createBranchedSession` is pi SDK surface, not a public contract we control;
  a pi upgrade can change its behavior. The backend test pins what we rely on.
- Fork of a just-created checkpoint mid-stream relies on the entry already
  being persisted; verify in the live pass.
