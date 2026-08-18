# Tool rows that group, and language-server rows that read cleanly

Status: **NEED GRILLING.** High-level. Not an approved contract.

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

## Questions the grill must answer

1. What breaks a run besides a kind change — a failure, an agent message, a
   time gap, a target in a different directory?
2. Does a finished group collapse automatically, or only new calls arriving
   after it is already summarized?
3. The exact lsp vocabulary: `lsp · refs draw · Ledger.svelte`? `lsp refs
   draw`? Does the verb live in the gutter or the target?
4. Do lsp calls group with each other across different verbs (`outline`,
   `refs`) or only within one verb?
5. How does leap address a row inside a collapsed group?
