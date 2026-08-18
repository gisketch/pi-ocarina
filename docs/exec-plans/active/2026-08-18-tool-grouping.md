# Tool row grouping & lsp row grammar — tickets

Spec: [2026-08-18-tool-row-grouping.md](../../specs/2026-08-18-tool-row-grouping.md)
Mockup: `docs/reference/design/PiOcarina Polish.dc.html` §01–02.

Status legend: `todo` · `in-progress` · `done`.

## G1 — the lsp row grammar — `done`

> Replace `asked outline of …` with the mockup's grammar: gutter `lsp`,
> SUBJECT at full strength, operation muted, result meta right-aligned.

- `src/shared/vocabulary.ts` stays: kind `lsp` already exists. The row's
  *gutter word* becomes `lsp` in every status (drop the `asking`/`asked`
  tenses — the pulse node already says live).
- `src/main/session/tool-rows.ts` — target becomes `SUBJECT` first (symbol
  when the tool takes one, else the file), operation second: `withRetry ·
  references`, `worker.ts · outline`, `diagnostics · workspace`.
- Result meta (`14 symbols`, `6 refs · 3 files`, `worker.ts:12`, `2 errors 5
  warns`) comes from the tool result at `tool_result` time and rides the row's
  existing meta slot; absent when the result does not parse.
- A diagnostics row with errors marks the row the way a failed row is marked
  today (the design colors the gutter word).
- Acceptance: the six tools produce six distinguishable rows in the mockup's
  grammar, live and replay.
- Validation: `tool-rows` and translator tests updated; a browser pass over a
  replayed lsp-heavy turn.

## G2 — the grouping projection — `todo`

> A pure function from a ledger's rows to display items: runs of two or more
> consecutive clean same-kind calls (read, grep, lsp, edit) become one group.

- New `src/renderer/src/lib/ledger-groups.ts` — `groupRows(rows)` returns
  `(row | group)[]`; a group holds its member rows, count, target preview
  (first three names `+N`), and aggregate meta (summed lines, `+a −d`).
- Rules from the spec: singles never group; a failed, denied, or cancelled
  call never joins a group and breaks the run; an approval row breaks the
  run; a kind change breaks the run; lsp groups across operations.
- Groups are a projection — block data, ids, and the session log are
  untouched; leap and the block menu still see rows.
- Acceptance: fixtures for every rule; a mixed ledger round-trips with every
  row present exactly once, in order.
- Validation: `ledger-groups.test.ts`, property test: flatten(groups) ==
  input.

## G3 — the group row, drawn and keyed — `todo`

> The summary row and its expansion, from the mockup: chevron · kind · count
> · preview · aggregate meta; members indented under a left rule.

- New `src/renderer/src/components/thread/GroupRow.svelte`; `ToolLine` is
  unchanged for singles. Member rows render with the existing row component.
- `⏎`/`l` expands, `h` collapses, `j`/`k` walk groups and rows; pointer click
  toggles. Expansion state lives with the projection, per thread, and
  persists across virtualization.
- An edit group's member row still opens its diff (one more `⏎`/`l`), exactly
  as the mockup draws it.
- Leap: a match on a member of a collapsed group expands the group and
  focuses the row (spec's open question — record what ships here).
- Acceptance: mockup §01 reproduced — read group collapsed, edit group
  expanded, diff one level deeper; keys work without the pointer.
- Validation: projection-state tests; browser pass with screenshots collapsed
  and expanded.
- Blocked by: G2.

## G4 — live groups — `todo`

> While a run is still producing calls, the group is open: current call
> visible with its progress; it collapses to the summary when the run ends.

- The projection marks a group `live` while its last member is `running`;
  a live group renders expanded regardless of stored state, with the current
  call's row pulsing as today.
- On the run's end (next row is a different kind, or the turn ends) the group
  collapses to its summary — unless the reader expanded it by hand.
- Counts and aggregate meta update in place as members land.
- Acceptance: a streamed lsp sweep draws one open group counting up, then one
  summary row; a failure mid-run surfaces as its own full row.
- Validation: projection tests over streamed row sequences; browser pass on a
  live turn.
- Blocked by: G2, G3.
