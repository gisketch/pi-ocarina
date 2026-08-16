# Thread isolation and the path to a pull request

Status: **NEED GRILLING.** High-level. Not an approved contract.

## Problem

The strip holds many threads at once, and that is the point of the design. Every
one of them writes to the same working copy. Two threads that both edit are not
parallel work; they are one working copy with two authors and no lock.

The second half of the same problem: once a thread has produced a good change,
the reader leaves the app to push it and open a pull request.

## Desired outcome

A thread can own an isolated working copy, and a finished thread can reach a
pull request without leaving the shell.

## In scope

- Creating a git worktree for a thread, and removing it when the thread closes.
- Showing which worktree and branch a thread is on.
- Committing, pushing, and opening a pull request from the commit card.
- What the git summary and the commit card mean when a thread is isolated.

## Out of scope

- Review of the pull request inside PiOcarina.
- Merging, rebasing, or conflict resolution.
- Any provider other than the one the repository's remote already uses.
- Automatic worktree creation for every thread. Isolation is a choice.

## Acceptance behavior

- A reader starts an isolated thread and its agent's edits do not appear in the
  main working copy.
- The column states which branch it is on, without the reader asking.
- Closing an isolated thread leaves no stray worktree and no lost commits.
- The commit card commits, pushes, and reports the pull request URL.
- An isolated thread with no commits closes cleanly and silently.
- A repository with no remote says so, rather than failing at the push.

## Constraints

- `src/main/git/` owns every git call. The renderer sends intent.
- Worktree creation is slow enough to need a pending state in the UI.
- A destructive step — removing a worktree with uncommitted work — asks first,
  through the existing confirm modal.
- pi runs against a working directory. Isolation changes what the driver passes
  when the session starts, so it cannot be retrofitted onto a running thread.

## Validation

- Tests against a real temporary repository, as `src/main/git/` already does.
- A live pass: two isolated threads editing the same file, neither seeing the
  other's edits.
- The failure paths, each proven once: no remote, dirty worktree on close,
  branch name already taken.

## Questions the grill must answer

1. Is isolation chosen when a thread is created, or can a thread be moved into a
   worktree later?
2. Who names the branch — the reader, the agent, or a rule?
3. What happens to an isolated thread's worktree when the app quits with the
   thread still open?
4. Does the pull request need a title and body from the agent, and what happens
   when it is still running?
5. Does the workspace rail show worktrees as separate entries, or does a thread
   carry that fact quietly?
6. Is `gh` a dependency, or does the app only open a URL in the browser?
