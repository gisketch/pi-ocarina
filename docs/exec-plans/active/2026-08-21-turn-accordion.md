# Turn Accordion — Execution Plan

Status: active 2026-08-21. Canonical behavior lives in
[the approved spec](../../specs/2026-08-21-turn-accordion.md).

Four tickets, sequential except TA1/TA2 which are independent of each other.
Each ticket runs its own targeted validation and ends in its own scoped
commit.

One fact discovered during planning, folded into TA3: the thread model times
only the *latest* turn (`ThreadViewModel.turn`, one `TurnSpan`), and replayed
history is deliberately untimed. So collapsed rows carry a duration only for
turns run in this session; a replayed turn's row is a bare `Worked ›`.

## TA1 — Grouping widens: contiguous mixed-kind runs, every kind

Delivered behavior: inside a ledger, any contiguous run of ≥2 successful tool
rows collapses to one group row regardless of kind mix:
`read 2 files · edited 1 file · ran 3 commands`. `bash`, `write`, `skill`,
`fetch` — every kind joins, and kinds unknown to the code join by default.
Failed / denied / cancelled rows still stay whole and break the run. Tool
rows clamp to one line.

Low-level notes:

- `src/renderer/src/lib/ledger-groups.ts`:
  - `GROUPABLE` allow-list dies. `joinable` becomes: status ok/running, no
    children, kind is not `think` and not an agent row. Delete the
    stale `bash`/`skill` exclusion comments; write the reversal note (the
    accordion is the summary layer now).
  - `groupRows` drops the `run[0].kind !== row.kind` flush — a run only
    breaks on a non-joinable row.
  - `RowGroup.tool` (single kind) becomes a per-kind tally; add
    `summaryOf(rows)`: kinds in first-appearance order, each through
    `countedAs`, joined with ` · `. `COUNTED` gains `bash`/`term`:
    `{one: 'command', many: 'commands'}` with a `ran N commands` verb form.
  - `previewOf`/`metaOf` unchanged (they already ignore kind).
- `src/renderer/src/components/thread/GroupRow.svelte`: header renders the
  mixed summary; the single-kind icon picks the run's first kind.
- `src/renderer/src/lib/blocks.ts` `groupEntry`: label built from
  `summaryOf` instead of `group.tool`.
- One-line clamp: `.target` in `ToolLine.svelte` goes
  `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0` (replacing `overflow-wrap: anywhere`); same treatment on the
  group preview if it wraps today.

Acceptance criteria:

- thought → read, write, grep, edit → thought → bash×3 draws: thought row,
  one group (`read 1 file · wrote 1 file · 1 search · edited 1 file`),
  thought row, one group (`ran 3 commands`).
- A failed bash between two ok bashes draws three items: group-able
  neighbours regroup around the red whole row.
- A multiline bash command occupies one visual line, ellipsized.
- Existing single-kind groups keep their summaries (`read · 4 files`).

Validation: extend `src/renderer/src/lib/ledger-groups.test.ts` — mixed run
forms one group, failure breaks, think breaks, agent row breaks,
`summaryOf` wording and order, unknown kind joins. `pnpm check`.

Blocked by: nothing.

## TA2 — Thoughts are prose

Delivered behavior: a `think` row stops rendering as a tool row. It draws as
a muted, italic chat-style message — no gutter icon, no `thought` label, no
clamp, full text, streaming as it arrives. It remains a nav stop and the
`o` (reasoning hidden) toggle still removes it entirely.

Low-level notes:

- `Ledger.svelte` branches on `row.kind === 'think'` to a new
  `ThoughtProse.svelte` (muted italic, `--fg-dim`, body text from
  `row.body.text`), replacing the ToolLine + expandable body path for
  thoughts. The row keeps its `navTarget` registration and menu hosting.
- Thought rows are not expandable any more (`isExpandable` false for think)
  — there is nothing left to expand; leap/copy already read the body text
  (`blocks.ts` `toolEntry` handles `thought` bodies).
- `visibleBlocks` / `reasoningOpen` untouched — hiding still filters
  `kind !== 'think'`.

Acceptance criteria:

- A thought reads as an italic muted paragraph, full text, no icon column
  misalignment of neighbouring rows.
- Streaming thought grows in place.
- `o` still removes all thinking; `j`/`k` still stop on a thought; block
  menu still opens on it; copy still yields the thought text.

Validation: targeted test on `isExpandable`/ledger projection if logic
moved; otherwise render-level assertions in existing ledger tests.
`pnpm check`.

Blocked by: nothing (visual interplay with TA1 groups, but no shared code
beyond `joinable` keeping think excluded).

## TA3 — The turn partition and its clocks (pure model)

Delivered behavior: none visible. A pure seam the accordion draws from.

Low-level notes:

- New `src/renderer/src/lib/turn-accordion.ts`:
  - `turnsOf(blocks): TurnItem[]` — partition at `user` blocks. A turn =
    `{ id, opener, inner: Block[], final: Block[] }`. `final` = the trailing
    contiguous run of `agent` blocks at the turn's end (turn-message rule
    from `thread-turn.ts`); everything else after the opener is `inner`.
    Pre-first-user blocks pass through unpartitioned. `id` = opener block
    id.
  - `turnResolved(turn, model)`: the turn is not the thread's running turn.
    Resolution status (`done`/`failed`/`stopped`) read from the span when
    one exists.
  - Every input block appears in exactly one place, in order — same
    invariant `groupRows` keeps, tested first.
- `ThreadViewModel` gains `spans?: Record<string, TurnSpan>` — turn id →
  span. `thread-progress.ts` `turnFor` keeps `turn` as-is and additionally
  stamps the finished span into `spans` under the opening user block's id
  (the newest user block wrote by the reducer). Replay writes none.
- Row label wording helper: `accordionLabel(span?, status?)` →
  `Working for 12s…` / `Worked for 1m39s` / `Worked 40s · aborted` /
  `Worked ›` (no span).

Acceptance criteria: model-level only, captured as tests.

Validation: new `turn-accordion.test.ts` — partition invariant, final-run
extraction (text→tools→text ends on the last text run), turn with no final
message (all inner), pre-user prologue, span stamping through a reduced
event sequence, label wording for all four states. `pnpm check`.

Blocked by: nothing (parallel-safe with TA1/TA2; committed before TA4).

## TA4 — The accordion draws, collapses, and navigates

Delivered behavior: the spec's headline. A running turn draws open under a
ticking `Working for 12s…` header row; resolution collapses it to
`Worked for 1m39s ›` + final message; errored/aborted turns collapse with
status. Click or nav-expand reopens. Closed accordion = one j/k stop.

Low-level notes:

- New `TurnAccordion.svelte`: the header row (chevron, label, live tick via
  `clock.watch()` like `TurnFooter`) and the visibility toggle over its
  inner blocks. No indent: members render exactly as today.
- `ThreadView.svelte` iterates `turnsOf(shown)`: prologue blocks direct,
  then per turn — opener message, accordion around `inner`, `final`
  messages direct. The existing block switch moves into a snippet both
  paths share (350-line ceiling: extract if crowded).
- Open state: `toolOpen`-style registry keyed `threadId:accordion:{turnId}`
  with default = unresolved (open) — the `groupShown` contract verbatim; a
  shared `accordionShown(turn, chosen)` in `turn-accordion.ts`.
- Nav: `navBlocks` gains the accordion layer — header is a stop
  (expandable, like a group); when closed, inner stops are skipped. Same
  callback pattern as `groupOpen`. `ThreadView.focusedBlock` passes both.
  `l`/`h` on the header toggles (whatever seam groups use — follow it).
- `TurnFooter` retires for turns the accordion covers: the header carries
  the same clock. The footer still draws for the send→first-block gap
  (before any turn block exists) — keep it mounted only while the running
  turn has no accordion to tick yet, then hand over. If the handover fights
  the layout, keep the footer and drop the tick from the collapsed header
  instead — decide in-ticket, note in the commit.
- Scroll pin: collapsing above the viewport must not yank the pinned
  bottom; verify with the existing follow/pin machinery.
- A pending ask/approve gate is always inside a *running* (open) accordion
  by construction; add a test guard: an unresolved gate forces the
  accordion open regardless of reader toggle — a hidden pending gate is a
  deadlock.

Acceptance criteria:

- Live turn: open, header ticks, blocks stream un-indented.
- Final message lands → collapses to bare `Worked for 1m39s ›` + final
  message. Reader toggle survives.
- Abort → `Worked 40s · aborted ›` collapsed.
- Replayed thread: every past turn collapsed, `Worked ›`, final messages
  visible.
- `j` steps over a closed accordion in one press; leap can land on the
  header; expanding makes members reachable; ring never lands on a hidden
  row (the `focusedBlock` guard path).
- Pending approve card can never sit inside a closed accordion.

Validation: `turn-accordion.test.ts` grows shown/nav agreement tests;
`blocks.test.ts` (or sibling) covers skipped inner stops; `pnpm check`;
`pnpm test` full run before commit.

Blocked by: TA1, TA2, TA3.
