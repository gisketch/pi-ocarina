# Exec Plan: Git & Terminal

Spec: [2026-08-15-git-terminal.md](../../specs/2026-08-15-git-terminal.md).
Visual truth: `PiOcarina Components.dc.html` section 13.

Status legend: `todo` · `in-progress` · `done`.

## E1 — Git status pipeline — `todo`

- Delivered behavior: per-workspace git status via `git` CLI (`execFile`,
  `--porcelain=v2`) in main, parsed by one small fixture-tested module. Statusbar
  and switcher cards show the reference's compact grammar (` main ↑1 +1~1`,
  `✓ clean`, `!2 conflicts`), replacing the mock strings. Refresh triggers:
  fs events under `.git` (HEAD, index, refs; debounced, single in-flight status
  per workspace), completion of any agent tool event in that workspace, and
  workspace focus — no fixed polling. Non-git folders show no git segments and
  everything else still works.
- Acceptance: an external `git commit` from another terminal updates the
  statusbar within ~1s; a non-repo pinned folder degrades cleanly; no polling
  timer exists.
- Validation: fixture tests for porcelain-v2 parsing (clean, dirty,
  ahead/behind, conflicts, detached HEAD, non-repo); manual external-commit
  check.
- Blocked by: B3 (real workspaces)

## E2 — Commit card — `todo`

- Delivered behavior: `/commit` (and a completed turn's suggestion) opens the
  commit card: proposed message + changed-file list with +/− counts; actions
  `commit`, `commit + push`, `edit message`. Commit runs git directly in main
  (not through pi); push failure raises an error toast with retry; the card
  never auto-commits.
- Acceptance: commit path produces a real commit in the workspace repo; push
  failure surfaces the retry toast; editing the message persists into the
  commit.
- Validation: integration test in a fixture repo (commit, failed push via bad
  remote); visual review vs section 13.
- Blocked by: E1, E4 (toasts), D2 (`/commit` entry)

## E3 — Real terminal drawer — `todo`

- Delivered behavior: the static drawer becomes a per-workspace pty (node-pty in
  main, login shell, cwd = workspace root) rendered by xterm.js with the WebGL
  renderer; pty bytes flow over a dedicated IPC channel with writes batched per
  frame. `t` toggles visibility; the pty survives drawer close and dies with the
  app. Focus rules: drawer focused → keys go to the pty except `esc` (back to
  NORMAL) — the shell mode machine stays the arbiter. The agent's own bash never
  runs in this pty.
- Acceptance: keystroke echo is imperceptible; a long-running command survives
  drawer toggle; `esc` always escapes; each workspace gets its own shell.
- Validation: manual latency/survival pass; headless focus-rule tests in the
  keyboard reducer; node-pty prebuild pinned against the Electron ABI.
- Blocked by: B3

## E4 — Toasts, confirm modal, connectivity banner — `todo`

- Delivered behavior: bottom-right toast stack with `steps()` entry (ok / info /
  error, action slot: view, undo, retry) emitted for background thread
  completion/failure, compaction done (undo), push results, and approval
  requests in unfocused threads — `view` jumps to the thread. Destructive
  confirm modal (quit with running threads, discard changes, checkpoint
  restore's honest copy): accent-red header, `⏎` confirms, `esc` cancels.
  Connectivity banner reflects `degraded`/`restored` events with countdown +
  `retry now`.
- Acceptance: each emitting event produces its toast; `view` performs the full
  jump (workspace + focus); modal keyboard semantics hold under every overlay
  combination; banner tracks a scripted degraded→restored sequence.
- Validation: toast/modal/banner states smoke-rendered from fixture events;
  headless jump + keyboard tests; visual review vs section 13.
- Blocked by: B5 (lifecycle/failure events), C2

## Order

E1 → E2 (also needs E4, D2) · E3 · E4 → E2
