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

## E3 — Terminal column — `done`

> Supersedes the drawer this ticket used to describe. Decided in the
> 2026-08-16 grill: the terminal is a **column in the strip**, scoped to the
> **workspace**; the drawer dies. Visual truth: Components §15 (which marks
> §13's drawer superseded) and the terminal column in v2's workspace A.
>
> Settled decisions: on demand via `t`, then persistent; `t` jumps and lands
> in TERM with the caret ready; leader `x` closes the column and kills the
> pty, using the same running-confirm as threads; `esc` leaves TERM, `esc esc`
> within the window sends one literal escape; `⇧H`/`⇧L` move any focused
> column, thread or terminal, and the order is remembered per workspace.

Delivered behavior: each workspace can hold one terminal column — a real pty
(login shell, cwd = workspace root) rendered full column height by xterm.js —
that is navigated, moved and closed exactly like a thread column.

Steps, verified against the tree before editing (written at `2b0a9cd`):

1. **Column vocabulary.** `src/renderer/src/lib/types.ts`: a strip column can
   now be a terminal. Add `kind?: 'terminal'` to `Thread` (or introduce a
   `Column` union if cleaner — decide at the code, not here) with id
   `terminal:<workspaceId>`, title `zsh`, and no `fresh` flag. `Workspace`
   is untouched: the terminal is an entry in `threads` so that focus, clamp,
   dots, `⇧H`/`⇧L` and leader `x` all work on it without special cases.
2. **TERM mode.** `src/renderer/src/lib/types.ts`: `Mode` gains `'TERM'`.
   `src/renderer/src/lib/keyboard.ts`:
   - In `reduceKey`, when `state.mode === 'TERM'`: every key returns
     `{ preventDefault: false }` untouched **except** `Escape`, which returns
     to NORMAL and emits `{ type: 'termEscape' }` (the shell decides whether
     the press within the double-tap window becomes a literal escape — the
     reducer stays time-free and testable).
   - `t` in NORMAL and leader `t`: emit `{ type: 'openTerminal' }` (replaces
     the `terminal: !state.terminal` toggle; delete the `terminal` field from
     `KeyState` and `initialKeyState`).
   - `i` in NORMAL emits `focusComposer` today; when the focused column is
     the terminal the shell maps it to TERM instead (the reducer does not
     know what is focused — keep that in the shell effect, as `statusOf`
     precedent does).
   - `⇧H`/`⇧L` (`key === 'H' | 'L'`, no meta/ctrl): emit
     `{ type: 'moveColumn', delta: -1 | 1 }`.
3. **Shell effects.** `src/renderer/src/lib/state/shell.svelte.ts`:
   - `openTerminal`: if the focused workspace has no terminal column, append
     one locally (catalog rebuild, same pattern as `#insert`) and invoke
     `createTerminal { workspaceId }`; focus its column; set
     `app.mode = 'TERM'`.
   - `termEscape`: on the first press set `mode = 'NORMAL'` and remember the
     timestamp; a second `esc` within 350ms while the terminal column is
     focused sends `\x1b` to the pty and returns to TERM. Keep the window in
     one named constant.
   - `moveColumn`: swap the focused column with its neighbour via a new
     `catalog.moveColumn(workspaceId, from, to)` (immutable rebuild), then
     `app.focusThread(to)`.
   - `closeThread` (leader `x`): when the focused column is the terminal,
     confirm if the pty reports a running foreground command, then invoke
     `killTerminal` and remove the column. Reuse `pendingClose`; the confirm
     text says shell, not thread.
   - Delete `toggleTerminal`, `shell.terminal`, and the `TerminalDrawer`
     mount in `App.svelte`; delete `TerminalDrawer.svelte`.
4. **Order persistence.** Column order (thread ids plus the terminal entry)
   is remembered per workspace: add `order: Record<string, string[]>` to the
   catalog store (v4 → v5, upgrade adds `{}`; follow the v3 → v4 shape in
   `src/main/catalog.ts`). The renderer sends it with `CatalogPosition`;
   `catalog.svelte.ts` applies it when listing threads — ids not in the
   stored order sort after it, newest first, so a new thread still lands
   visibly at the end.
5. **Protocol.** `src/shared/protocol.ts`: `createTerminal { workspaceId }` →
   `{ ok: true }`, `killTerminal { workspaceId }` → `{ ok: true }`,
   `writeTerminal { workspaceId, data }` → `{ ok: true }`,
   `resizeTerminal { workspaceId, cols, rows }` → `{ ok: true }`. Output is
   **not** a session event: pty bytes flow on a dedicated
   `pty:<workspaceId>` channel (built as `piocarina:pty:…` in this ticket, but
   shipped as `pty:…` to match the sibling `session:*` names) (preload exposes
   `terminal.onData(workspaceId, cb)` / `terminal.write(...)`), because a
   busy build would otherwise contend with thread batches in one queue.
6. **Main.** New `src/main/session/terminal.ts`: `TerminalService` owning one
   `node-pty` per workspace (login shell from `$SHELL`, cwd = workspace
   path). Bytes out are batched per animation-frame-ish tick (16ms, same
   constant family as `EventBatcher`); writes pass through unbuffered. The
   pty dies on `killTerminal`, on unpin, and with the app (`dispose`). The
   running-confirm's question is answered by whether the pty has spawned a
   foreground child — `pty.process` differing from the login shell is the
   cheap honest signal; verify what node-pty actually reports on macOS
   before relying on it.
   node-pty is a native module: pin the prebuild against the Electron ABI in
   `package.json` and note the rebuild command in `docs/quality.md`.
7. **Renderer column.** New
   `src/renderer/src/components/strip/TerminalColumn.svelte`: xterm.js with
   the WebGL addon, themed from the design tokens (background `--bg-deep`,
   accent cursor), fonts from the existing stack. NORMAL: `j`/`k` scroll the
   xterm viewport (wire into `scrollColumn`'s dispatch or handle locally —
   whichever keeps `columns.ts` ignorant of xterm). TERM: xterm gets real
   focus and its `onData` goes to `writeTerminal`. Resize observer →
   `resizeTerminal`. Footer hint row per Components §15. `Strip.svelte`
   branches on the terminal column kind next to the existing `fresh` branch.
8. **Statusbar.** `Statusbar.svelte` mode segment already reads `app.mode`;
   confirm `TERM` renders in the accent style like `INSERT` (it shares
   `app.accented` — extend that getter).
9. **Keymap overlay.** Add rows: `t` terminal column, `⇧H/⇧L` move column,
   `esc esc` literal escape (in TERM).

Acceptance: `t` in a pinned workspace creates and focuses the terminal, mode
reads TERM, typing reaches the shell with imperceptible echo; `esc` returns
to NORMAL with the column still focused; `esc esc` sends an escape a pty vim
visibly reacts to; `h`/`l` in NORMAL walk between threads and terminal;
`⇧H`/`⇧L` reorder and the order survives a relaunch; leader `x` on a busy
shell asks first, and after closing, `t` spawns a fresh shell; a long-running
command keeps producing output while a thread column is focused; each
workspace gets its own shell and cwd.

Validation: keyboard-reducer tests for TERM, `t`, `⇧H`/`⇧L`, and the
escape-passthrough contract; shell-effect tests for open/close/move and the
double-esc window (fake clock); catalog v4 → v5 upgrade test; order
round-trip test; manual latency and survival pass in the packaged run.
node-pty prebuild pinned.

Blocked by: —

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
