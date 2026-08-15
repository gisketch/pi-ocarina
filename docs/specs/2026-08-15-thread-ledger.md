# Spec: Thread & Ledger

Status: approved (from grill 2026-08-15). Visual truth: `PiOcarina Components.dc.html`
sections 04, 05, 08, 09 (skill row), 11. Behavior truth: this file.

## Problem & Outcome

A thread must show everything the agent did — messages, tools, decisions, waits —
as a scannable ledger that stays smooth while streaming. Outcome: a thread column
component that renders the full agent-event vocabulary from the reducer's view
model, at any history length.

## In Scope

Message rendering (user, agent, streaming), markdown, tool-call ledger and all its
row variants, ask card, approve card, thinking/skeleton states, checkpoint divider,
queued steering row, compacting states, subagent nesting, tool error states,
thread column header states.

## Out of Scope

Where events come from (session backend spec), composer, terminal, git cards.

## View Model (contract with the reducer)

A thread is an ordered list of blocks: `user-message`, `agent-message` (streaming
flag, markdown AST), `ledger-group` (list of tool rows), `ask`, `approve`,
`checkpoint`, `compaction`, `queued-steer`, plus a thread status
(`idle | running | waiting-input | failed | done | interrupted`). Tool row kinds:
`read`, `grep`, `write`, `edit`, `bash`, `fetch`, `todo`, `skill`, `agent`
(subagent, with nested child rows one level deep), each with status
(`running | ok | fail | timeout | cancelled | denied`) and an optional expandable
body (file preview, matches, diff, terminal output, todo list, skill manifest).
Unknown event kinds render a visible fallback row showing the raw kind — never
dropped.

Two contract points settled while building the reducer (C1):

- **`status` vs `runState`.** The view model carries both: `runState` is what the
  backend last reported, `status` is what the header shows. They differ only
  while a card is pending — answering an ask must return the thread to
  `running`, which a single field cannot express. A `failed` or `interrupted`
  thread keeps that state regardless of open cards.
- **`tool-progress` added to the protocol** (`{ id, meta }`). The reference draws
  running rows carrying a live summary ("run 4/10…", "214 files…") and nothing
  in the vocabulary could say that: `tool-start` has no summary and `tool-end`
  ends the row. Additive within protocol 1 — a backend that never sends it costs
  nothing, and an older reader degrades it to a `raw` row.
- **Nothing starts expanded.** `open` has no event behind it; a live turn that
  expanded every body would bury the column. The mock catalog re-applies the
  reference's pre-expanded rows as presentation data, and that retires with it.

Three more settled while wiring the cards (C3):

- **`compaction-skipped` added to the protocol** (`{ id, reason }`). pi refuses
  to compact a session it considers too small, and that refusal previously
  arrived as an anonymous `raw` note — leaving the running divider shimmering
  forever over work that had already stopped. It is named, and carries the id of
  the start it ends. A skipped compaction collapses no history: it replaced
  nothing.
- **The ask card has no live producer.** pi 0.84 has no elicitation mechanism,
  so no `ask` event is ever emitted and `answerAsk` has nothing to answer. The
  card, the command, and the seam all exist and are exercised by the mock
  catalog, ready for the day pi gains one.
- **No `undo` on the compaction card.** The reference offers one; nothing in pi
  0.84 can put a compacted context back. The control is omitted rather than
  shipped dead. Open item, not a decision against it.

And what pi 0.84 cannot express, found while building the error states (C4):

- **A denied call is not a failed call.** pi reports every tool outcome as one
  boolean (`isError`), so a command the user refused looked identical to one
  that crashed. The approval gate records the `toolCallId` it blocked and the
  adapter maps that to `denied`; the ledger blames the right party.
- **No subagents.** pi 0.84 has no agent or task tool, and `ToolExecutionStart`
  carries no parent reference, so nested rows have no producer. The reducer,
  the nesting rule (one level, grandchildren adopted by the grandparent) and
  the renderer are built and fixture-tested.
- **No `timeout` or `cancelled` tool status, and no per-row retry.** Same single
  boolean; and pi retries turns, not individual calls. The row variants exist;
  the retry offered to the user is the thread-level `retryTurn`.

And how the scrollback budget is actually met (C5):

- **Virtualization is `content-visibility`, not JavaScript windowing.** Blocks
  stay in the DOM and are skipped by layout and paint while off-screen. A
  hand-rolled window would break expansion state, scroll anchoring, text
  selection and find-in-page; containment breaks none of them. Measured on a
  5,000-block thread: 1.8ms median layout per scroll step against an 8.34ms
  budget, versus 12.3ms with containment disabled — where every frame drops.
  The streaming block is exempt from containment, so the caret never stutters.
- **Markdown is a deliberate subset**: inline code, bullet and numbered lists,
  fenced blocks with their language named. Anything else stays literal, because
  eating a character the agent wrote is worse than not styling it. Syntax
  highlighting remains deferred.

## Acceptance Behavior

- Streaming: agent text grows with the blinking caret block; ledger rows appear as
  tools start, flip status when they settle; running rows pulse their spine node.
  Updates are coalesced per animation frame; a 60-token burst causes one DOM pass.
- Expansion: rows with bodies toggle on click (chevron ▸/▾); bodies render lazily
  on first expand; diffs show +/− lines colored per the reference; bash bodies show
  prompt + output monospace block.
- Ask card: options are clickable once; picking marks selection, dims others, sets
  status "answered ✓", and sends the answer to the session. Reply via composer also
  resolves the card.
- Approve card: allow once / always allow / deny per the approvals decision
  (per-workspace persistence for "always"); resolved state shows outcome inline.
  While an ask/approve is pending the thread status is `waiting-input`.
- Checkpoint divider: rendered between blocks; `restore` asks confirmation with
  explicit copy that **files are not rewound** ("rewinds the conversation; your
  files keep later edits"), then truncates/forks the session (conversation-only
  rewind decision).
- Queued steering: text entered while running renders as a QUEUED row ("sends
  after step") with cancel ✕; delivered on next step boundary.
- Compaction: running state shows the pixel-shimmer divider; done state renders the
  summary card with before→after ctx %, `expand original`, `undo`.
- Subagents: `agent` rows nest child tool rows one indent level; parallel subagents
  render as sibling rows updating independently.
- Errors: timeout rows offer retry; cancelled rows render struck-through;
  denied rows show `denied` in error color. Thread `failed` state matches the
  failure-policy spec (red dot in column header, error row with manual retry).
- Long threads: scrollback virtualizes; collapsed bodies use
  `content-visibility`/`contain`. 5k-block threads scroll without jank.
- Skeletons: while a thread's history replays on open, message/ledger skeletons
  animate with `steps()` only, per the reference.

## Settled Constraints

- Markdown: rendered from the agent's text with inline code, lists, fenced blocks
  styled per reference; syntax highlighting may be deferred but the block chrome
  is required. `y` (shell spec) copies the newest fenced block.
- All colors via tokens; accent usage follows the reference (accent = activity,
  green `#7fd7a4` = ok/add, red `#e07a6b` = err/del, amber `#e9c46a` = warn/gate).
- The reducer is pure; this component tree renders view model only — no IPC calls
  from thread components except the interaction commands (pick, approve, expand is
  local, restore, cancel-queued, undo-compaction).

## Validation

- Reducer fixture tests: recorded event streams (including unknown kinds, error
  paths, subagent interleaving) → expected view models.
- Component smoke: mount a thread with a fixture view model; assert every block
  variant renders (the Components file's inventory is the checklist).
- Perf check: scripted streaming burst into a 5k-block virtualized thread while
  measuring dropped frames in DevTools; budget: none visible at 120Hz.

## Risks

- pi event granularity for subagents/steering/compaction is unverified (open risk
  in the architecture file); the view model above is the contract — the adapter
  must map or degrade gracefully (fallback rows) if pi emits less.
