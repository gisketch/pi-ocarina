# Spec: Core Usability (G)

Source: grill on 2026-08-16, after the user ran the app for real.
Parent: [piocarina-architecture.md](piocarina-architecture.md).
Blocks: the git & terminal milestone. This spec ships first.

## Problem

The app was built thread-outward. The thread column is real, but the chrome
around it still shows mock data or dead ends:

1. First open shows the demo catalog. Nothing tells the user it is fake.
2. The status bar ctx meter and token/cost segment are hardcoded strings from
   the static shell. Real `usage` events exist and nothing reads them.
3. The titlebar model chip misses the model event on thread creation (an event
   race) and then reads "pi default" forever.
4. Leader `n` emits `newThread` and the effect handler is an intentional no-op.
   Only the command palette creates threads.
5. After a send creates a thread, the catalog re-lists threads from disk. A
   session file that has not flushed yet is missing from the list, so the new
   column vanishes while its turn runs.
6. No key or command closes a thread. The strip only grows.

## Outcome

A person opens the app, pins a folder, makes threads, works in them, closes
them, and every chrome segment tells the truth about the focused thread.

## Settled decisions

- **Welcome screen, not demo.** With no folder pinned, the app shows a welcome
  screen (wordmark, one line, "pin a folder" action). It is not blank, and
  nothing on it is fake.
- **The demo catalog is hidden, not deleted.** It loads only in the browser
  harness (no preload bridge), where it is the only thing that can render.
  Electron never shows it.
- **Leader `n` creates a real thread** in the focused workspace: new column,
  strip focus moves to it, composer gets input focus. With no pinned folder,
  leader `n` starts the pin flow instead. Bare `n` stays unbound.
- **Titlebar dots mirror the thread strip**, not the workspaces: one dot per
  thread in the focused workspace, the focused thread's dot lit. (Supersedes
  the "ocarina dots — active workspace indicator" reading of the design.)
- **Leader `x` closes the focused thread.** Close means hide: the column
  leaves the strip and the strip stays hidden across restarts, but the session
  file stays on disk, history search still finds the thread, and jumping to it
  from search brings the column back. Closing a running thread asks for one
  confirmation, because it cancels the turn. Delete is out of scope.
- **An empty thread does not survive a restart.** A thread with no user
  message yet is not listed when the workspace reloads.
- **The status bar reads the focused thread.** Ctx meter and token/cost come
  from that thread's last `usage` event; zero-valued until the first turn ends.
  The branch segment stays blank until the git milestone.

## Acceptance criteria

- Fresh install, Electron: welcome screen. `⏎` (or leader `n`) opens the
  native folder picker; pinning shows the workspace with one fresh column.
- Leader `n` in a pinned workspace: a new column exists within a beat, it has
  focus, the composer has input focus, and typing + `⏎` streams a real turn in
  that same column. The column never disappears mid-turn.
- Titlebar: dots equal the focused workspace's thread count; moving focus with
  `h`/`l` moves the lit dot; the model chip shows the real model for a thread
  that was just created, a thread reopened after relaunch, and a thread
  switched to — no "pi default" once a real thread is focused.
- Status bar: after a turn ends, the ctx meter and token/cost segment show
  that thread's numbers; switching threads switches the numbers.
- Leader `x`: the focused column leaves the strip; on a running thread a
  confirmation comes first and declining changes nothing. After restart the
  closed thread is still absent. Finding it in history search (`/`) and
  pressing `⏎` restores its column.
- Restarting with an empty thread (created, nothing sent): the empty thread is
  gone; no orphan column.

## Validation expected

- Headless state tests for: welcome-vs-strip branching, leader `n` effect,
  local thread insert (no disk round-trip), leader `x` including the running
  confirm, dot count/lit derivation, statusbar derivations, and the
  reopen-from-search path.
- One live pi test: create → model chip event received after follow; usage
  event after a turn.
- Manual pass in the packaged run for the welcome flow and focus handoffs.

## Risks / open questions

- When exactly pi writes the session file decides how "empty threads vanish"
  is implemented (natural, if pi writes lazily; a cheap has-user-message check
  on listing, if pi writes eagerly). Verify at G2, do not guess.
- Hiding closed threads needs a catalog store field (v3 → v4). Upgrade must
  keep pins and approvals, like v2 → v3 did.
