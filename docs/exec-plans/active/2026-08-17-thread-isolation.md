# Exec Plan: Thread Isolation & Pull Requests

Spec: [2026-08-16-thread-isolation.md](../../specs/2026-08-16-thread-isolation.md)
(approved 2026-08-17).

Status legend: `todo` · `in-progress` · `done`.

## K1 — The worktree module — `done`

> Every git call in one place, as `src/main/git/` already demands. Nothing in
> this ticket is visible; it is the seam every later ticket stands on, and it is
> the only one that can be tested against a real repository without an app.

- Delivered behavior: `src/main/git/worktree.ts` exports `addWorktree(repo,
  branch)`, `listWorktrees(repo)`, `removeWorktree(path, {force})`, and
  `worktreeState(path)` (has commits ahead of the base, has uncommitted edits).
  Worktrees are created at `<repo>/.ocarina/worktrees/<branch with / as ->` on a
  new branch. The first creation appends `.ocarina/` to `.git/info/exclude`,
  once — a second call must not duplicate the line.
- Also exports `validateBranchName(name)` returning the first rule broken or
  null: spaces, `..`, any of `~^:?*[`, leading or trailing `/`, trailing
  `.lock`, empty. Shared with the renderer through `src/shared/`, so the dialog
  and git cannot disagree about what is legal.
- Acceptance: a worktree appears in `git worktree list`; its branch exists; the
  workspace's own `git status` stays clean afterwards; a taken branch name fails
  with git's message rather than a thrown stack.
- Validation: tests against a real temporary repository, as `commit.test.ts`
  already does. `pnpm check`.
- Blocked by: nothing.

## K2 — A thread can start in a worktree — `done`

> The backend half of the feature, demoable without any dialog: pass the option
> and the agent's edits land somewhere else.

- Delivered behavior: `createThread` takes `worktree?: { branch: string }`.
  When present, main creates the worktree first, starts the pi session with that
  directory as its cwd, and remembers it in the thread's location so every later
  read — the change log, `listChanges`, the git summary — follows the thread
  rather than the workspace. A failed creation rejects the command with git's
  message and leaves no thread behind.
- `ThreadSummary` carries `branch: string | null` so a reopened thread is still
  known to be isolated after a restart.
- Acceptance: two threads created with different branches edit the same file
  and neither sees the other's edits; the workspace's working copy is untouched;
  quitting and reopening the thread finds the same worktree.
- Validation: seam tests through the driver with a temporary repository; one
  live pass under `PIOCARINA_PI_LIVE=1`.
- Blocked by: K1.

## K3 — The question every new thread asks — `done`

> The only way a worktree is made. Small surface, and the whole feature is
> unreachable without it.

- Delivered behavior: creating a thread in a workspace that is a git repository
  opens a modal first: *run this thread in a new worktree?* `No` is focused,
  `enter` takes it, `esc` takes it. `Yes` reveals one field for the branch name,
  validated as it is typed with `validateBranchName`; confirm stays dead while
  the name is illegal, and a name already used by a branch or a worktree
  directory is reported under the field. Confirming creates the thread with the
  worktree option and shows a pending column until `git worktree add` returns.
  A workspace that is not a repository opens no modal at all.
- Acceptance: `esc` and `no` produce the thread that exists today, with no
  worktree on disk; an illegal name cannot be confirmed; a git failure closes
  the pending column and shows the git message.
- Validation: headless state tests for the modal's key flow and validation;
  one pass in the running app.
- Blocked by: K2.

## K4 — Saying which tree a thread is in — `done`

- Delivered behavior: an isolated thread's column header carries a branch chip
  (`⑂ fix/OCA-231`); a thread in the workspace directory carries nothing. The
  status bar reports the focused thread's own git state when it is isolated, and
  the workspace's when it is not. The rail is unchanged.
- Acceptance: the chip's presence matches the thread's isolation after a
  restart; the workspace's git summary never counts an isolated thread's files.
- Validation: headless tests over the header and status-bar projections; a
  visual pass.
- Blocked by: K2.

## K5 — Closing — `done`

> The ticket that can lose work, so it is the one with the explicit rules.

- Delivered behavior: closing an isolated column removes the worktree silently
  when it is clean and has no commits. Uncommitted edits ask through the
  existing confirm modal, naming the file count: *keep* leaves the worktree and
  branch on disk, *discard* runs `git worktree remove --force`. A worktree that
  holds commits is never removed. Quitting with the thread open leaves
  everything. A `/worktrees` command lists every worktree under
  `.ocarina/worktrees`, marks those with no live thread, and removes the ones
  the reader picks. **The sweep is split out as K5b below; the close rules are
  what K5 delivered.**
- Acceptance: no rule removes a worktree holding commits; a discarded dirty
  worktree leaves nothing in `git worktree list`; nothing is removed at startup.
- Validation: temporary-repository tests for each of the three close paths;
  a live pass for the confirm modal.
- Blocked by: K2.

## K5b — The sweep command — `todo`

- Delivered behavior: `/worktrees` lists every checkout under
  `.ocarina/worktrees` for the focused workspace, marks the ones with no live
  thread and says what each holds, and removes the ones the reader picks under
  the same three rules K5 uses. Nothing is swept at startup.
- Acceptance: a worktree holding commits cannot be swept; a worktree with a
  live thread is listed but not offered for removal.
- Validation: headless tests over the list and its removal calls.
- Blocked by: K5.

## K6 — Commit, push, pull request — `todo`

- Delivered behavior: the commit card runs against the thread's worktree and
  names the branch in its header. After a successful commit it offers *push and
  open pull request*: `git push -u origin <branch>`, then the host's pull
  request URL read from the push output and opened in the system browser. No URL
  in the output builds one from the remote — GitHub `/compare/<branch>?expand=1`,
  GitLab `/-/merge_requests/new?merge_request[source_branch]=<branch>`,
  Bitbucket `/pull-requests/new?source=<branch>` — and an unknown host opens the
  remote's web root with the branch name copied. No `gh`, no `glab`.
- A repository with no remote shows the reason in place of the push action,
  before the commit rather than after it. Committing and pushing while the agent
  runs are both allowed.
- Acceptance: the pushed branch exists on the remote; the opened URL matches the
  host; the no-remote path never reaches a push.
- Validation: unit tests for URL building from every supported remote shape, ssh
  and https, with and without `.git`; a scrape test over recorded push output; a
  live push against a scratch remote.
- Blocked by: K2. Sits beside K5.

## K7 — The failure pass — `todo`

> Two of the spec's risks are only observable in a real repository, and both
> silently produce a broken working day if they are wrong.

- Delivered behavior: a recorded pass proving three failures each behave as
  written — no remote, dirty worktree on close, branch name already taken — and
  one check that the repository's own tooling (`pnpm check`, the test run, the
  build) does not walk a worktree's copy of every file. If any tool does, the
  ignore is fixed here or `.ocarina/worktrees` moves out of the repository.
- Acceptance: the three failures reach the reader as messages; `pnpm test` run
  with an active worktree collects the same number of tests as without one.
- Validation: the pass itself, written into this plan.
- Blocked by: K5, K6.
