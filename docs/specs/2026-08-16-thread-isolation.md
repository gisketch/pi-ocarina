# Thread isolation and the path to a pull request

Status: **APPROVED.** Grilled 2026-08-17. Ready for tickets.

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

## Acceptance behavior (revised in the grill)

- A reader starts an isolated thread and its agent's edits do not appear in the
  main working copy.
- The column states which branch it is on, without the reader asking.
- Closing an isolated thread leaves no stray worktree and no lost commits.
- The commit card commits against the worktree, pushes the branch, and opens
  the host's pull request page in the browser.
- Answering *no*, or pressing `esc`, creates an ordinary thread and no worktree
  at any point.
- A workspace that is not a repository creates threads without any dialog.
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

## Settled in the grill

1. **Default is no worktree.** A new thread runs in the workspace's own working
   directory. That is the common case and it stays free.
2. **Every new thread asks, when the workspace is a repository.** Creating a
   thread opens one dialog before the column appears: *run this thread in a new
   worktree?* Two answers. *No* — the default, and what `enter` on an untouched
   dialog does — creates the thread in the workspace directory exactly as
   before. *Yes* reveals one field: the branch name. `esc` is the same as *no*.
   A workspace that is not a git repository never sees the dialog. There is no
   chip and no toggle anywhere else; this dialog is the only way a worktree is
   made.
3. **Worktrees live under `.ocarina/worktrees/<name>` in the workspace root.**
   One place, inside the repository, easy to find and easy to sweep. The
   directory is added to the repository's `.git/info/exclude`, so an untracked
   worktree never shows up in the workspace's own git summary.
4. **The reader names the branch.** The dialog's field takes a branch name and
   the reader types it — `fix/OCA-231`, `feat/diff-gutter`, whatever the team's
   convention is. No generated slug, no prefill. The worktree directory takes
   its name from the branch, with `/` replaced by `-`: branch `fix/OCA-231`
   lives in `.ocarina/worktrees/fix-OCA-231`.
5. **The worktree exists before the first message.** It is created when the
   dialog is confirmed, because pi is given a working directory when the
   session starts. The column shows a pending state while `git worktree add`
   runs, and a failure closes the column with the git error rather than opening
   a thread that quietly is not isolated.
6. **Validation in the dialog.** The name is checked as it is typed against
   git's own rules — no spaces, no `..`, none of `~^:?*[`, no leading or
   trailing `/`, no trailing `.lock` — and confirm stays dead until the name is
   legal. A branch or worktree directory that already carries the name is
   reported under the field; the app never appends `-2` to make room.
7. **Closing a column, and quitting.** A clean worktree with no commits is
   removed silently. A worktree with uncommitted edits asks through the existing
   confirm modal, naming the file count: *keep* leaves worktree and branch on
   disk, *discard* runs `git worktree remove --force`. A worktree that holds
   commits is never removed, however clean it is — the commits are the work.
   Quitting with the thread open leaves everything alone; the worktree is still
   in `git worktree list`, and a reopened thread finds it. Sweeping strays is a
   command the reader runs, never something the app does at startup.
8. **The commit card, isolated.** The card runs against the worktree rather
   than the workspace, and its header names the branch. After a successful
   commit it offers one further action: *push and open pull request*. That
   action pushes with `git push -u origin <branch>`, reads the push output for
   the host's "create a pull request" URL, and opens it in the system browser.
   No URL in the output means the app builds one from the remote; an unknown
   host gets the remote's web root and the branch name on the clipboard.
9. **Git only. No host client.** `gh` and `glab` are not used and are not
   dependencies. Every host is reached the same way: push, then a browser page.
   The pull request title is typed on that page. The agent never writes a title
   or a body; the host fills them from the branch's commits, as it already does.
10. **A running agent does not block the card.** Committing and pushing mid-run
    are both legal — the agent's next edit lands on top. Only worktree removal
    is blocked. A repository with no remote says so in place of the push button,
    before the commit rather than after it.
11. **Isolation shows on the thread, never in the rail.** The column header
    carries a branch chip, and the status bar reports the focused thread's
    branch and its worktree's own git state. A thread in the workspace's own
    directory carries no chip, so the chip's presence is the isolation. The rail
    keeps listing workspaces only. The workspace's git summary keeps reporting
    the main working copy: `.ocarina/worktrees` is written into
    `.git/info/exclude`, so isolated work never appears there as untracked
    noise.
12. **Isolation is fixed at creation.** pi takes a working directory when the
   session starts. A running thread cannot move into a worktree.

## Pull requests across hosts — what is actually possible

Three separate abilities, and only the first works everywhere:

- **Push a branch.** `git push -u origin <branch>`. Works with every host.
- **Reach the "open a pull request" page.** Most hosts print that URL on stderr
  during the push (GitHub, GitLab, Gitea, Bitbucket all do). The app reads the
  push output and opens the first URL it finds. When the push prints nothing,
  the app builds the URL from the remote: `/compare/<branch>?expand=1` for
  GitHub, `/-/merge_requests/new?merge_request[source_branch]=<branch>` for
  GitLab, `/pull-requests/new?source=<branch>` for Bitbucket. An unknown host
  gets the remote's web root and a copied branch name.
- **Create the pull request with a title and body, without a browser.** This
  needs a host client. `gh` covers GitHub only; `glab` covers GitLab. There is
  no portable command.

So the honest contract: **push always, open the right page almost always,
create it headlessly only on GitHub with `gh` installed.** `gh` is a bonus, not
a dependency.

## Risks that stay open

- **`.git/info/exclude` is per-clone, not committed.** A fresh clone of the
  repository has no such line until PiOcarina writes it. The app must write it
  when it first creates a worktree, and must not duplicate the line.
- **A worktree inside the repository is unusual.** git allows it, and the
  exclude line keeps status quiet, but a tool that walks the working tree —
  a test runner, a bundler, a linter — will find the worktree's copy of every
  file unless it honours the ignore rules. Worth one live check before this
  ships.
- **The push URL is scraped from stderr.** Hosts change that text. The built-URL
  fallback is what keeps this from being brittle, so the fallback must be the
  tested path, not the emergency one.
- **Two isolated threads on the same branch name** cannot happen through the
  dialog, which rejects a taken name. They can happen if a reader creates the
  branch outside the app between the check and the create. `git worktree add`
  fails there, and the failure must reach the reader as a message, not a
  silently unisolated thread.
- **A removed checkout takes its thread out of the listing.** pi lists sessions
  by working directory, and the app enumerates the directories from
  `git worktree list`. Once a worktree is removed, its thread is no longer
  listed, so it cannot be reopened and history search cannot find it — though
  the transcript itself is untouched, under pi's own session store. Reopening
  it would fail anyway, since its working directory is gone. Making those
  threads searchable again needs the retired checkouts remembered in the
  catalog; that is not in this milestone.
- **The push URL is the remote's to choose.** The link a push prints comes from
  the git server. The app opens it, confined to http/https by the existing
  allow-list and stripped of any credentials, but a hostile remote chooses
  which page a reader lands on.
