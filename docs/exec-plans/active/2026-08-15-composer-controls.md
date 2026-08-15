# Exec Plan: Composer & Controls

Spec: [2026-08-15-composer-controls.md](../../specs/2026-08-15-composer-controls.md).
Visual truth: `PiOcarina Components.dc.html` sections 06, 09, 10, 12, 14
(§14 supersedes §09 for the selectors).

Status legend: `todo` · `in-progress` · `done`.

## D1 — Real send & queue semantics — `done`

> Verified in the running app: the composer is a textarea that grows with the
> text, `⇧⏎` newlines, and the hint beside `⏎` reads **send** on an idle thread
> and **queue** on a running one — so it says which of the two it will do before
> the user commits.
>
> Two decisions worth naming. The branch is on `runState`, not the displayed
> status: a thread reading `waiting-input` because a card is open may still have
> a turn in flight, and typing into that must queue rather than start a second
> turn on top of it. And **sending in a fresh column creates the thread**, so
> the hero is not a dead end.
>
> The composer never draws the user's own message. It comes back as an event
> like everything else — one projection, one truth.

- Delivered behavior: the milestone-1 composer sends for real: thread idle →
  `⏎` issues `prompt` and the message appears as a user block; thread running →
  send becomes queued steering (QUEUED row, cancellable, delivered at the next
  step boundary via `steer`). `shift+⏎` newlines, empty send no-ops, the
  composer is never disabled, and it stays inside the shell mode machine (no
  global handlers of its own).
- Acceptance: send-vs-queue branches purely on thread status; queueing while
  running then cancelling leaves no residue; INSERT focus rules from milestone 1
  unchanged.
- Validation: headless state tests for send-vs-queue branching; reducer fixtures
  for queued-steer delivery/cancel already in C-plan reused; `pnpm check`.
- Blocked by: C2, B6 (steering)

## D2 — Slash-command menu — `todo`

- Delivered behavior: `/` at position 0 opens the command list rendered by the
  same list primitive as the command palette (filter as you type, `↑↓`, `⏎`,
  `esc`). v1 commands: `/compact`, `/commit` (delegates to the git commit card),
  `/context`, `/model`. Unknown `/text` sends as a literal message.
- Acceptance: menu opens only at position 0; every v1 command performs its
  action; literal fallback sends unchanged.
- Validation: headless open-filter-pick flow tests; visual review vs section 06.
- Blocked by: D1

## D3 — @-mention file picker — `todo`

- Delivered behavior: `@` opens a fuzzy file picker over the workspace tree
  (recents first, dirs marked; `↑↓` + `tab`/`⏎` inserts a file-reference chip
  into the text). Backing index is a `.gitignore`-aware recursive walk in main,
  exposed via the driver; mentioned files attach to the prompt as context
  references.
- Acceptance: picker filters a real pinned workspace's tree; inserted chips
  survive editing around them; prompt carries the references to the backend.
- Validation: unit tests for the walk (ignore rules, recents ordering) and the
  chip insertion model; headless picker flow tests.
- Blocked by: D1

## D4 — Attachments — `todo`

- Delivered behavior: drag-drop anywhere on the column shows the reference drop
  zone; any file accepted, images previewable; attachments render as inline
  chips flowing with text, removable ✕ before send; in sent messages chips
  expand inline (image preview with `open ↗`, text files as a monospace block).
  Attachment bytes travel to the session backend with the prompt — the renderer
  reads files only for preview thumbnails.
- Acceptance: drop → chip → send → inline expansion round-trips a png and a log
  file; removing a chip before send removes it from the prompt payload.
- Validation: headless chip-model tests; manual drag-drop pass; visual review
  vs section 10.
- Blocked by: D1

## D5 — Model & reasoning spotlight — `todo`

- Delivered behavior: the two-step detached-fzf spotlight from §14, opened by
  `m` (NORMAL), leader `m`, `/model`, the titlebar model chip, and the settings
  "default model" row. Step 1 lists models from pi's config via the driver (no
  hardcoded lists, no keys stored): pixel-bar tier glyph, name, descriptor, meta,
  number keys; the detached input fuzzy-filters, `⏎` picks the first match.
  Step 2 is the off/low/med/high reasoning tile grid (`1–4`/`⏎` picks and
  closes; `esc` steps back to step 1, not out). Selection applies to the focused
  thread's next turn, persists per thread, and renders in the titlebar/statusbar
  chips; the settings "reasoning effort" row cycles the same state with `h`/`l`.
- Acceptance: selection changes the next turn's model (visible in usage events);
  per-thread persistence survives relaunch; chips always reflect the focused
  thread; `esc` in step 2 returns to step 1; fuzzy `⏎` picks the first match.
- Validation: headless two-step selector state tests (open paths, fuzzy pick,
  esc-back); integration check that `setModel`/`setReasoning` reach pi; visual
  review vs section 14.
- Blocked by: D1, B3 (per-thread persistence), F1 (spotlight primitive)

## D6 — History search — `todo`

- Delivered behavior: an overlay searching thread titles/content across all
  workspaces (match highlighting, workspace tag, recency label); `⏎` jumps to
  the thread, switching workspace and strip position as needed. v1 scans session
  files lazily with a result-latency cap.
- Acceptance: a hit in an unfocused workspace jumps correctly (workspace,
  focus memory, scroll); latency stays under the cap on the fixture corpus.
- Validation: headless search/jump tests; manual latency check against a corpus
  of real session files.
- Blocked by: B3 (session store), C2

## Order

D1 → {D2, D3, D4, D5, D6}
