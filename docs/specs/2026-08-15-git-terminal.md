# Spec: Git & Terminal

Status: approved (from grill 2026-08-15). Visual truth: `PiOcarina Components.dc.html`
section 13. Behavior truth: this file.

## Problem & Outcome

Agent work is git work; users need ambient repo state, a fast commit path, and a
real shell without leaving the app. Outcome: per-workspace git status everywhere
the design shows it, a commit card, a pty terminal drawer, plus the app-level
notification surfaces (toasts, confirm modal, connectivity banner).

## In Scope

Git status pipeline, statusbar/titlebar git segments, commit card, terminal
drawer, toasts, destructive confirm modal, connectivity banner.

## Out of Scope

Checkpoint/rewind (conversation-only; session backend spec), review/diff UI beyond
ledger diffs (Later/Not Now).

## Acceptance Behavior

- **Git status**: each pinned workspace shows branch + summary (ahead/behind,
  added/modified counts, conflict count) in statusbar and switcher cards, matching
  the reference's compact grammar (` main ↑1 +1~1`, `✓ clean`, `!2 conflicts`).
  Status refreshes on: fs events under `.git` (HEAD, index, refs), completion of
  any agent tool event in that workspace, and workspace focus — no fixed polling.
  A non-git folder shows no git segments and everything else still works.
- **Commit card** (via `/commit` or a completed turn's suggestion): shows proposed
  message + changed-file list with +/− counts; actions `commit`,
  `commit + push`, `edit message`. Commit runs git directly in main (defaults
  decision: not through pi). Push failure → error toast with retry (failure-policy
  grammar). The card never auto-commits.
- **Terminal drawer** *(superseded 2026-08-16: the terminal is a strip column
  now, one per workspace — see the E3 ticket and Components §15; the pty,
  focus and lifecycle decisions below still hold)*: `t` toggles per-workspace
  pty (login shell, cwd = workspace root), xterm.js + WebGL renderer,
  200px-class drawer per reference.
  The pty survives drawer close (toggle = visibility); it dies with the app
  (no-daemon decision). Focus rules: drawer focused → keys go to the pty except
  `esc` (returns to NORMAL) — the shell mode machine remains the arbiter.
- **Toasts**: bottom-right stack, `steps()` entry per reference; variants ok /
  info / error with action slot (view, undo, retry). Emitted for: background
  thread completion/failure, compaction done (undo), push results, approval
  requests in unfocused threads. Clicking `view` jumps to the thread.
- **Confirm modal**: destructive actions only (quit with running threads, discard
  changes, checkpoint restore per its honest copy); accent-red header, `⏎`
  confirms, `esc` cancels.
- **Connectivity banner**: reflects session-backend `degraded`/`restored` events
  (provider/network state — reinterpreted from the design's "daemon" copy);
  countdown + `retry now`.

## Settled Constraints

- Git via `git` CLI (`execFile`, `--porcelain=v2`) in main; no libgit bindings;
  parsing lives behind one small module with fixture-tested output parsing.
- node-pty in main; renderer gets pty bytes over a dedicated IPC channel; xterm
  writes are batched per frame like agent events.
- Terminal is user-owned: the agent's own bash runs inside pi's tooling, never in
  this pty.

## Validation

- Fixture tests for porcelain-v2 parsing (clean, dirty, ahead/behind, conflicts,
  detached HEAD, non-repo).
- Manual: drawer latency (keystroke echo imperceptible), status updates within
  ~1s of an external `git commit` from another terminal.
- Toast/modal/banner states smoke-rendered from fixture events.

## Risks

- node-pty native rebuilds against Electron ABI (pinned electron + prebuilds;
  known, boring, must be scripted in CI later).
- fs-watch storms on huge repos: debounce git refresh (single in-flight status
  per workspace, trailing-edge).
