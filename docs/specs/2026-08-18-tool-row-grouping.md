# Tool rows that group, and language-server rows that read cleanly

Status: **Approved 2026-08-18.** Decisions settled in the Polish mockup
(`docs/reference/design/PiOcarina Polish.dc.html`, sections 01–02). Tickets in
[2026-08-18-tool-grouping.md](../exec-plans/active/2026-08-18-tool-grouping.md).

## Problem

A working agent produces runs of near-identical rows. The screenshot that
prompted this spec shows seventeen `asked outline of …` rows followed by five
`read …` rows — twenty-two lines that carry three facts: it outlined the
frontend, then read five files, and none of it failed. The ledger charges a
full row for every call, so a busy turn scrolls the conversation away.

Separately, the language-server vocabulary shipped as `asked outline of
src/app.tsx`. The sentence reads correctly but spends its width on the verb
instead of the target, and the gutter word `asked` says less than the one word
that actually identifies these rows: `lsp`.

## Desired outcome

Runs of similar tool calls collapse into one summary row — `read 5 files`,
`lsp · outlined 17 files` — expandable to the full list. While the run is
still happening the group stays live: the summary counts up and the current
call is visible. Language-server rows drop the sentence dressing for a
denser form led by `lsp`.

## What the industry does (read before grilling)

Surveyed so the grill argues about fit, not facts:

- **Claude Code (CLI and desktop)** collapses a turn's activity into summary
  lines (`Read 3 files`, a task header with elapsed time) and expands on
  demand (ctrl+o verbose mode). Failures are never folded into a happy
  summary.
- **Codex CLI** merges consecutive same-kind actions into one entry listing
  the targets, with the group header carrying the count.
- **Cursor** collapses a run into a `Ran N tools` pill; clicking unrolls the
  individual calls with their own status marks.

The shared rules: group only **consecutive calls of the same kind**; show the
**live call while the run is open**; **counts update in place**; a **failed
call breaks the group** or stays visible inside it — an error is never
summarized away; expansion state **persists** once opened.

## In scope

- Grouping consecutive ledger rows of the same kind into a summary row.
- Live behavior: what the group shows while its run is still producing calls.
- Expand/collapse per group, from keyboard and pointer, state preserved.
- The language-server row vocabulary: gutter word and target format.
- How leap, `j`/`k` traversal, and the block menu treat a group.

## Out of scope

- Grouping across kinds ("worked for 12s" whole-turn folding).
- Summarizing bash output or diffs inside a group.
- Any change to what pi is asked or how tools execute.

## Acceptance behavior

- Three consecutive `read` calls render as one row reading `read 3 files`;
  expanding shows the three original rows unchanged.
- A group's count and label update while the agent is still calling; the
  newest call in the run is visible without expanding — the reader can always
  see what is happening *now*.
- A failed call is visible without expanding anything. However the grill
  resolves the shape, a red mark is never hidden behind a green summary.
- A single call renders exactly as it does today; groups form at two or more.
- Language-server rows read with `lsp` in the gutter and the target leading
  with what was asked about — exact vocabulary settled by the grill.
- Replay and live produce the same grouping for the same history.

## Constraints

- Grouping is a projection in the renderer. Ledger data stays per-call;
  nothing about grouping enters main or the session log.
- The virtualized transcript must not re-measure the world when a group opens.
- The gutter's width discipline (`widestLabel`) still holds — a group label is
  part of that vocabulary, not an exception to it.

## Validation

- Projection tests: runs, boundaries at kind changes, failure breaking or
  surfacing, single calls untouched, live count updates.
- A browser pass over a replayed busy turn, screenshotted collapsed and
  expanded.

## Decisions (settled by the mockup, 2026-08-18)

1. **What groups**: consecutive same-kind calls of read, grep, and lsp. Edits
   group too, but a member row keeps its diff one more expand away — a diff is
   never summarized out of reach.
2. **What never groups**: singles, failures, and anything that needed
   approval. Those stay full rows; a group forms at two or more clean calls.
3. **Live behavior**: an open group streams — the current call and its
   progress are visible; the group collapses to its summary when the run
   finishes.
4. **Summary grammar**: chevron · kind · count ("read · 4 files") · a
   truncated preview of targets ("worker.ts · retry.ts · queue.ts +1") ·
   aggregate meta right-aligned (total lines read, `+41 −12`).
5. **Keys**: `j`/`k` move between rows, `⏎`/`l` expand, `h` collapse — the
   same vocabulary the rest of the app uses.
6. **lsp row grammar**: gutter word `lsp`; then the SUBJECT (file or symbol)
   at full strength; then the operation word muted (`outline`, `references`,
   `definition`, `diagnostics`); result meta right-aligned (`14 symbols`,
   `6 refs · 3 files`, `worker.ts:12`, `2 errors 5 warns`). A diagnostics row
   with errors colors its gutter word. Same grammar as read/grep rows.
7. **lsp grouping**: lsp rows group with each other as one kind, across
   operations — the summary counts calls, the expansion shows each operation.

## Open questions (small, settle in implementation)

- How leap addresses a row inside a collapsed group — proposal: leap match
  expands the group and focuses the row; record what ships in the plan doc.
