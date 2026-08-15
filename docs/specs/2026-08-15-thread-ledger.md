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
