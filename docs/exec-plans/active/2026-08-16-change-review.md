# Change review — execution plan

Spec: [2026-08-16-change-review.md](../../specs/2026-08-16-change-review.md)
(approved 2026-08-16, fifteen decisions).
Shell amendment: [2026-08-16-modes-amendment.md](../../specs/2026-08-16-modes-amendment.md).

Six tickets. J1 is the only one that has to come first: nothing can be drawn
until a diff exists. J3 is independent of the rest and can be taken at any point.

## Order

```
J1 ─┬─ J2 ── J6
    └─ J4 ── J5 ─┘
J3 (independent)
```

## J1 — an edit produces a real diff — `done`

Delivered behavior: an `edit` or `write` row carries a diff body with true line
numbers and context, built from the file itself.

Steps:

1. `src/shared/vocabulary.ts`: `DiffLine` gains `line?: number` — the line number
   in the file after the change for `+` and context, and before it for `-`. Keep
   it optional; the mock threads do not have one and must keep working.
2. New `src/main/session/file-diff.ts`:
   - `diffLines(before: string, after: string): DiffLine[]` — a longest common
     subsequence walk, with three lines of context around each run of changes and
     nothing between runs that are far apart.
   - It is pure and takes strings. No file system, no git, so it can be tested as
     a function.
   - A cap: a file over `MAX_DIFF_BYTES` returns a one-line summary body rather
     than a diff. A minified bundle must not be diffed line by line.
3. `src/main/session/pi-driver.ts`: around a tool call whose kind is `edit` or
   `write`, read the target file at `tool_execution_start` and again at
   `tool_execution_end`, and hand both to the translator. A file that does not
   exist yet reads as empty — that is what makes `write` all additions.
4. `src/main/session/pi-translate.ts`: `toolBody` gains the `edit`/`write` case,
   fed by the snapshots rather than by the result text.
5. Snapshots are kept per thread and path: the first `before` and the latest
   `after`. J4 reads them; nothing else does.

Acceptance: an edit in a live thread shows `-` and `+` lines with numbers, and a
`write` shows every line as an addition.

Validation: `file-diff.test.ts` over pure strings — an insert, a delete, a
replace, a file with no trailing newline, an empty before, an empty after, and
identical inputs. A live-pi test behind `PIOCARINA_PI_LIVE=1`.

Blocked by: nothing.

## J2 — the row opens itself, and says what it is hiding — `done`

Delivered behavior: an `edit`/`write` row arrives expanded, capped at 24 drawn
lines, and states the remainder rather than truncating in silence.

Steps:

1. `pi-translate.ts`: `open: true` on `edit` and `write` rows. Every other kind
   keeps its current default.
2. `ToolBody.svelte`: the `diff` branch draws at most `DRAWN_DIFF_LINES = 24`.
3. The row's meta gains `+N more lines · a` when the body is capped. The `a` is a
   hint, not a control; the block menu is the control.
4. Reloading a thread must produce the same expansion — check the replay path
   sets `open` the same way the live path does.

Acceptance: a three-line edit shows three lines and no hint. A 200-line edit
shows 24 and says what it hid. Reopening the thread shows the same thing.

Validation: translator tests for `open` on both paths. A CDP pass on a large
edit: the column does not grow past the cap.

Blocked by: J1.

## J3 — a row says what is happening to it — `done`

Delivered behavior: `read` reads `reading` while its call runs, and `read` when
it lands. Every kind, both tenses. No target moves sideways when a call lands.

Steps:

1. New `src/renderer/src/lib/tool-label.ts`: `labelFor(kind, status)` and
   `widestLabel(kinds)`. A table, not string manipulation — `edit → editing /
   edited`, `write → writing / wrote`, `bash → running / ran`, `grep → grepping /
   grepped`, `fetch → fetching / fetched`, `read → reading / read`.
   A `denied` or `cancelled` row must not read as though it finished.
2. `Ledger.svelte`: the ledger becomes the grid — `grid-template-columns:
   max-content 1fr max-content` — and rows become items, so one measurement
   serves every row. Do not measure in JavaScript: a rect read on a
   `content-visibility: auto` element forces its layout, which is a cost the
   transcript's perf work already removed once.
3. The gutter's minimum stays the reference's 36px.
4. The measurement must not shrink when a call lands. Reserve the widest label
   each present kind *could* show.

Acceptance: a running `edit` row reads `editing`; when it lands it reads `edited`
and nothing else on the row moves.

Validation: unit tests for the label table, including every status. A CDP pass
that reads a target's `x` before and after a call lands and asserts they match.

Blocked by: nothing.

## J4 — the viewer exists, and DIFF owns the keys — `done`

Delivered behavior: `d` opens a floating viewer with the thread's changed files
on the left and the change on the right. `esc` closes it.

Steps:

1. `src/shared/protocol.ts`: `listChanges: { params: { threadId }; result: {
   files: ChangedFile[] } }`, where a `ChangedFile` is a path, its net `+`/`-`
   counts, and its merged diff — the first snapshot against the last.
2. `src/main/session/` answers it from J1's snapshots. One differ, two endpoints:
   this must call `diffLines` and not reimplement it.
3. `src/renderer/src/lib/types.ts`: `Mode` gains `'DIFF'`. `keyboard.ts` binds
   `d` in NORMAL and READ, and `esc` out of DIFF.
4. New `src/renderer/src/components/overlays/DiffViewer.svelte`: two panes, the
   file list focused first. It floats above the strip, **not** inside a column —
   a column has paint containment and would clip it.
5. `Statusbar.svelte`: DIFF colours the way READ does.
6. A thread with no changes says so in one sentence and offers nothing to move
   through.

Acceptance: `d` opens the viewer with every file the thread changed. `esc`
returns to the mode that opened it. The mode chip says DIFF throughout.

Validation: reducer tests for `d` from NORMAL and READ, and for DIFF owning `j`
and `a`. A CDP pass: the viewer paints in full over a scrolled column.

Blocked by: J1.

## J5 — the viewer takes vim keys — `done` (with J4)

Delivered behavior: every key in the spec's table works, and the viewer keeps up
with a thread that is still editing.

Steps:

1. `j`/`k` within the focused pane; `tab`, `h`, `l` switch pane.
2. `gg`/`G` to the ends. `gg` needs a pending-`g` state; keep it inside the
   viewer's own reducer rather than in the shell's.
3. `n`/`N` step hunks and cross a file boundary at the ends.
4. `/` filters the file list. Reuse the fuzzy matcher in `lib/fuzzy.ts`.
5. `y` copies the focused hunk.
6. Live follow: a file arriving while the viewer is open is appended and never
   moves the focused selection.

Acceptance: a reader crosses four files with `n` alone. Filtering to one file and
pressing `esc` leaves the filter, not the viewer.

Validation: unit tests for the viewer's reducer, including `gg` interrupted by a
third key. A CDP pass with an agent editing while the viewer is open.

Blocked by: J4.

## J6 — the two surfaces meet, and it stays fast — `done`

Delivered behavior: `a` on a capped row opens the viewer at that row's file.
`␣ d` opens it from the leader bar. A thread of large edits holds its budget.

Steps:

1. `block-menu.svelte.ts`: an `open in viewer` entry on rows that have a diff.
2. `keyboard.ts`: `d` joins the leader chords, and the which-key bar with it.
3. `KeymapOverlay.svelte`: a DIFF section.
4. Perf: 200 edits across 40 files, measured the way `docs/quality.md` requires.
   Two things to watch — the ledger grid must not re-measure per row, and the
   viewer must not hold every intermediate snapshot.

Acceptance: `a` on a capped row lands in the viewer with that file selected.

Validation: the perf numbers, recorded in this file the way H1–H5 recorded
theirs.

Blocked by: J2, J5.


## What was found on the way (2026-08-16)

Recorded because each was a decision the ticket did not anticipate.

1. **The cap moved from the translator to the renderer.** J2 put `+N more lines`
   in the row's meta, which the translator writes. How many lines fit is a
   drawing question and the translator cannot answer it; the marker is drawn by
   `ToolBody` instead.
2. **A row opens on its body, not on its kind.** Keying the default on
   `edit`/`write` opened the reference's `write` row, which has no diff. The
   mock thread's own test caught it. A row that opens on to nothing is worse
   than one that stays shut.
3. **Subgrid was the wrong tool for the shared gutter.** It is the obvious way
   to share one column across rows, and it is incompatible with the layout
   containment each row carries — for exactly the reason the containment exists.
   The width is computed from the kinds a ledger holds and written as a custom
   property, which is a write rather than the rect read the ticket warned about.
4. **`close()` has to put the pane back.** It cleared everything except which
   pane had the keys, so a viewer reopened after being left in the diff pane
   took different keys than one opened fresh. Three tests failed on it at once.
5. **A failed read is not "no changes".** The browser harness has no backend, so
   `listChanges` rejects — and the viewer said the thread had changed nothing.
   The two look identical in the data and mean opposite things. Found by opening
   the viewer in the harness, not by a test.
6. **The driver crossed 350 lines.** It gave up what a live session's events do
   (`session-events.ts`) and what can be done to an existing thread
   (`turn-ops.ts`). Both were already separable; the limit only forced the issue.

## Perf evidence (2026-08-16)

The shape J6 asked for, as a test rather than a one-off measurement, in
`change-log.perf.test.ts`:

- **200 edits across 40 files** — 200 snapshot pairs of a 400-line file, plus
  the 40 merged diffs the viewer asks for: **51ms total**, against budgets of
  2000ms and 500ms.
- **50 edits of one file** holds two versions of it, not fifty. Asserted on the
  content of the first and last snapshot, so a regression that started keeping
  every intermediate version would fail rather than merely slow down.

The differ's own budget is in `file-diff.test.ts`: a one-line change in a
4,000-line file stays under 50ms, which is what the head-and-tail trim buys.
