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

## D2 — Slash-command menu — `done`

> Verified in the running app: `/` lists the commands, `/mod` narrows to
> `/model`, and writing "look at src/lib" opens nothing — the menu is bound to
> position 0, so a path in a sentence never fights the person typing it. A space
> closes it: by then they are writing prose, not choosing a command.
>
> **Two of the four v1 commands are not built.** `/commit` needs the git
> pipeline (E plan) and `/context` needs a context-breakdown surface that does
> not exist. Both are omitted from the menu rather than listed as entries that
> would do nothing when picked. `/compact` and `/model` are real.
>
> An unknown `/word` is sent as written. Someone who types `/shrug` meant to say
> `/shrug`, and a partial name like `/comp` is not guessed at either.

- Delivered behavior: `/` at position 0 opens the command list rendered by the
  same list primitive as the command palette (filter as you type, `↑↓`, `⏎`,
  `esc`). v1 commands: `/compact`, `/commit` (delegates to the git commit card),
  `/context`, `/model`. Unknown `/text` sends as a literal message.
- Acceptance: menu opens only at position 0; every v1 command performs its
  action; literal fallback sends unchanged.
- Validation: headless open-filter-pick flow tests; visual review vs section 06.
- Blocked by: D1

## D3 — @-mention file picker — `done`

> `@` opens a fuzzy picker over the workspace tree; `tab` or `⏎` completes the
> path; the index is a `.gitignore`-aware walk in main, cached per workspace so
> a filesystem crawl never sits in front of a keystroke.
>
> **A mention is the path in the message, not an attachment.** pi 0.84's
> `prompt()` takes text and images — there is no channel for attaching a text
> file. So `@src/thread.ts` goes into the message and pi opens it with its own
> read tool. That is the real mechanism; calling it an "attachment" would
> describe something the seam cannot do.
>
> Two details worth keeping: the picker will not open inside `me@example.com`
> (an `@` must follow whitespace), and the walk skips `node_modules` and `.git`
> whatever the ignore file says — walking `node_modules` alone takes longer than
> every other folder combined. The index caps at 8,000 files; stopping beats
> freezing the window.

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

## D5 — Model & reasoning spotlight — `done`

> Verified against real pi: `listModels` returns the machine's own models, the
> thread reports which one it is on when it opens, and switching takes effect
> and is reported back.
>
> **The important finding: `getModels()` returns 1267 models** — pi's whole
> catalogue, nearly all for providers with no credentials on this machine.
> Selecting one throws "No API key". `getAvailable()` returns **22** here: the
> set that can actually run. A selector listing a thousand models that mostly
> fail on click is worse than no selector.
>
> Two more. **`ReasoningLevel` widened from the design's four to pi's seven**
> (`off · minimal · low · medium · high · xhigh · max`); the four came from a
> mock, and capping a model that supports `max` would have quietly limited what
> the user could ask for. The tiles render whichever levels the chosen model
> supports, and a model that cannot reason skips the second step entirely.
> **Neither choice is stored by this app** — pi writes both into the session
> file, so a relaunch shows what pi restored rather than a second copy that
> could disagree.
>
> A clamp steps *down*, never up: making a turn think harder than asked would
> cost money the user did not agree to spend.

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
