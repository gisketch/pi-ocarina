# Spec: Composer & Controls

Status: approved (from grill 2026-08-15; selectors revised 2026-08-15 from the
updated design import). Visual truth: `PiOcarina Components.dc.html` sections 06,
09, 10, 12, 14 — §14's detached-fzf spotlight supersedes §09's inline cards for
the selectors. Behavior truth: this file.

## Problem & Outcome

All input to the agent flows through one composer. Outcome: a composer with modal
focus, slash commands, @-mentions, attachments, and model/reasoning controls that
never steals keys from the shell's keyboard model and never blocks on a running
turn.

## In Scope

Composer states, send/queue semantics, slash-command menu, @-mention file picker,
attachments (chips, drag-drop, inline expansion), model selector, reasoning
selector, history search overlay.

## Out of Scope

Thread rendering of sent messages, session transport, terminal input.

## Acceptance Behavior

- **Focus**: `i` focuses (INSERT; accent border + glow, per reference); `esc`
  returns to NORMAL. Placeholder names the workspace. `⏎` sends; `shift+⏎`
  newlines. Empty send is a no-op.
- **Send vs queue**: thread idle → prompt starts a turn. Thread running → send
  becomes queued steering (QUEUED row per thread spec, cancellable, delivered at
  the next step boundary). The composer is never disabled.
- **Slash menu**: typing `/` at position 0 opens the command list (filter as you
  type, `↑↓` pick, `⏎` run, `esc` dismiss). v1 commands: `/compact`, `/commit`
  (delegates to git spec card), `/context`, `/model`. Unknown `/text` sends as a
  literal message.
- **@-mention**: typing `@` opens the fuzzy file picker over the workspace tree
  (recents first, dirs marked; `↑↓` + `tab`/`⏎` inserts a file reference chip into
  the text). Mentioned files are attached to the prompt as context references.
- **Attachments**: drag-drop anywhere on the column shows the drop zone
  (png · log · patch · csv per design; any file accepted, images previewable);
  attached files render as inline chips flowing with text, removable ✕ before
  send. In sent messages, chips expand inline (image preview with `open ↗`, text
  files as a monospace block).
- **Model & reasoning selector** (Components §14): one two-step spotlight opened
  by `m` in NORMAL, leader `m`, `/model`, the titlebar model chip, and the
  settings "default model" row. A detached fzf input floats above the panel
  (autofocused; `esc` chip shown).
  - Step 1 — MODEL: rows from pi's config, each with a pixel-bar tier glyph,
    name, descriptor, meta (`<ctx> · <speed> · <cost>`), and a number-key chip.
    Number keys or `⏎` pick; typing fuzzy-filters and `⏎` picks the first match.
    Picking advances to step 2.
  - Step 2 — REASONING: four tiles (off/low/med/high) with stepped pixel bars;
    `1–4` or `⏎` picks and closes; `esc` returns to step 1 (only the second
    `esc` closes). Footer hint names the chosen model.
  - Selection applies to the focused thread's next turn and persists per thread;
    current values render in the titlebar/statusbar chips. Reasoning is also
    cycled with `h`/`l` on the settings row (same state).
- **History search**: overlay searching thread titles/content across workspaces
  (match highlighting, workspace tag, recency label); `⏎` jumps to the thread
  (switching workspace/strip position as needed).

## Settled Constraints

- The composer participates in the shell's mode state machine — it never installs
  global key handlers of its own.
- Slash/mention menus are the same visual primitive as the command palette list
  (one component, parameterized).
- Attachment bytes go to the session backend with the prompt; no renderer-side
  file reading beyond preview thumbnails.
- Model/reasoning options come from pi config via the driver (no hardcoded lists).

Settled while building the selector (D5), against pi 0.84.2:

- **Only models that can actually run are listed.** pi's `getModels()` returns
  its whole catalogue — 1267 entries on the development machine, nearly all for
  providers with no credentials, and selecting one throws "No API key".
  `getAvailable()` returned 22. The selector shows that set; an empty set says
  so rather than offering models that cannot run.
- **Reasoning has pi's seven levels**, not the design's four tiles: `off`,
  `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. The four came from a mock,
  and a model supporting `max` would have been quietly capped. The tiles render
  the levels the chosen model supports; a model that cannot reason skips the
  step. A clamp steps down, never up — thinking harder than asked costs money
  the user did not agree to.
- **pi persists both.** `setModel` and `setThinkingLevel` write into the session
  file, so this app stores neither. The `model` event reports what pi restored.

## Validation

- Headless state tests: mode/focus transitions, slash/mention menu open-filter-
  pick flows, send-vs-queue branching on thread status.
- Reducer fixtures cover queued-steer delivery and cancellation.
- Visual review against reference states (normal, insert, slash open, mention
  open, chips, drop zone).

## Risks

- @-mention needs a workspace file index; v1 ships a simple recursive walk with
  ignore rules (`.gitignore`-aware), upgraded later if large repos need it.
- History search across many session files may need an index later; v1 scans
  lazily and caps result latency before widening scope.
