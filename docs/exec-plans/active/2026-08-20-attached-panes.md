# Attached Pane Groups — Execution Plan

Status: completed 2026-08-20. Canonical behavior lives in
[the approved spec](../../specs/2026-08-20-attached-panes.md).

The broad Sonata readiness command currently reports four pre-existing source
files above the repository's 350-line guideline. They are outside this feature;
this plan does not hide, exempt, or refactor them. Per owner direction, each
ticket uses one small targeted validation and ends in its own scoped commit.

## AP1 — Give every terminal its own transport identity ✅

Delivered behavior: main, preload, and renderer address a terminal by a stable
terminal id while still resolving its cwd from the workspace id. Two terminals
in one workspace can run independently.

Acceptance criteria:

- Create takes `{ terminalId, workspaceId }`; write, resize, busy, kill, and
  output use `terminalId`.
- Starting or killing one terminal does not affect another in the workspace.
- App shutdown still kills all terminal processes.

Validation: targeted `src/main/session/terminal.test.ts`.

Blocked by: nothing.

## AP2 — Model one attachment slot per host ✅

Delivered behavior: chats and buffers can each own one independently identified
terminal attachment. `t` creates or focuses the terminal belonging to the
focused host, with transactional rollback on startup failure.

Acceptance criteria:

- Attachment state is pane-type-extensible but permits zero or one pane per
  host.
- Terminal identity survives re-docking and is not derived from workspace alone.
- `t` creates on the right, reuses an existing terminal, and enters TERM.
- Failed creation removes the attachment, restores host focus/mode, and toasts.

Validation: targeted renderer attachment/terminal state tests.

Blocked by: AP1.

## AP3 — Render and center an attached group ✅

Delivered behavior: a host and terminal read as one zero-gap centered entity,
with automatic `2:1` sizing and a usable narrow-window fallback.

Acceptance criteria:

- Unattached columns retain the existing `780px` width and inter-group gap.
- Attached groups target `780px + 390px`, have no internal gap, and center as a
  whole when either member is focused.
- Active pane is bright and its partner dim; other groups remain unfocused.
- Below the `640px + 320px` minimum, only the focused member is visible and
  receives normal column width.

Validation: targeted pure strip geometry tests plus `pnpm check` only if the
component compiler reports an edit-time error.

Blocked by: AP2.

## AP4 — Add magnetic movement, close safety, and restoration ✅

Delivered behavior: keyboard movement treats attachments spatially; close and
restart preserve the agreed lifecycle without orphaning or surprising shells.

Acceptance criteria:

- `h` / `l` traverses panes in visual order; focused hosts move as whole groups
  with `Shift-H` / `Shift-L`.
- A focused terminal crosses its host, then re-docks to the adjacent empty host;
  occupied slots block movement.
- Closing a terminal leaves its host. Closing a host shows one explicit terminal
  warning, augmented—not duplicated—when the shell is busy.
- Layout persistence stores terminal id, host id, and side. Restart creates a
  fresh shell; invalid restoration is discarded with one toast.

Validation: targeted keyboard/lifecycle/persistence tests, then one final
`pnpm check` for the complete feature.

Blocked by: AP3.
