# Thread fork — tickets

Spec: `docs/specs/2026-08-16-thread-fork.md` (D1–D6).

## T1 — backend: `forkThread` command

Status: todo

Behavior: a `forkThread { threadId, checkpointId, title }` command copies the
parent session at the checkpoint into a new session file, opens it as a live
thread, names it `title`, and returns the new thread id.

Steps:

1. `src/shared/commands.ts`: add `forkThread` with params
   `{ threadId, checkpointId, title }`, result `{ threadId }`.
2. New `src/main/session/fork-thread.ts`: takes the parent `Thread`, calls
   `parent.session.sessionManager.createBranchedSession(checkpointId)`
   (throws a plain error when the manager does not persist), opens the new
   file with `SessionManager.open`, builds the live session with
   `factory.open(cwd, workspaceId, manager, newId)`, adopts it, renames it to
   `title`. cwd/branch/workspaceId come from `workspaces` (`cwdOf`,
   `branchOf`, `idForPath`) — the fork shares the parent's folder (D2).
3. `pi-driver.ts`: one thin `case 'forkThread'` delegating to the new file.
4. Pin test `src/main/session/fork-session.test.ts` against the real SDK in a
   temp dir: create a session, append user/assistant entries, fork at the
   first entry; assert the new file's `buildContextEntries()` ends at the
   checkpoint, the parent's entries are untouched, and the new header points
   at the parent.

Acceptance: command returns a new id; parent file byte-identical after fork;
fork's replay ends at the checkpoint.

Blocked by: nothing.

## T2 — renderer: fork flow state

Status: todo

Behavior: a `forkThread(workspaceId, parentId, checkpointId, parentTitle)`
renderer action invokes the command with title `Fork - <parentTitle>`,
follows the new thread, and inserts its column directly right of the parent.

Steps:

1. `catalog.svelte.ts`: `insertAfter(workspaceId, afterId, threadId, title,
   branch)` — same made-column shape as `#insert`, placed at
   `indexOf(afterId) + 1` (append when the parent is not on the strip).
2. New `src/renderer/src/lib/state/fork.svelte.ts`: the flow above; failure
   goes to a toast, like `newThread`'s. Returns the new column index or null.
3. Tests: insertAfter position (middle, end, parent missing); flow invokes
   `forkThread` with the `Fork - ` title; failure toasts and adds no column.

Acceptance: column lands right of parent with the `Fork - ` title and the
parent's branch.

Blocked by: T1 (command name and shape).

## T3 — block menu: fork action

Status: todo

Behavior: `a` on a message with a checkpoint offers `fork from here` next to
restore. Enter runs it once (no confirm — fork destroys nothing), the new
column is focused and its composer is in insert mode, empty.

Steps:

1. `block-menu.svelte.ts`: `BlockActionId` += `'fork'`; `actionsFor` pushes it
   right after restore under the same guard (`checkpointId` + wired).
2. `run()`: fork case looks up the parent's workspace and title from
   `catalog`, closes the menu, runs the T2 flow, then focuses the new column
   and enters insert mode.
3. Tests: action offered exactly when restore is; no confirm step; focus and
   mode after a successful fork; menu closes and nothing runs when the
   catalog no longer has the thread.

Acceptance: spec's acceptance list, minus the live pass.

Blocked by: T2.

## T4 — review and fix

Status: todo

`/sonata-review` over the fork commits; fix findings; full suite +
svelte-check + check-sonata on touched files.

Blocked by: T3.

## Out of plan

- Live pass with pi (spec validation, reader-gated): forking a real running
  session, mid-stream checkpoint persistence. Left to the user's desktop run,
  like the dashboard's live checks.
