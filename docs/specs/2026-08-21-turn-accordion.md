# The turn accordion: one row per finished turn

Status: **grilled and approved 2026-08-21 (owner direction).**

Amends [2026-08-18-tool-row-grouping.md](2026-08-18-tool-row-grouping.md)
(grouping widens from same-kind runs to contiguous mixed runs, and `bash`,
`write`, `skill` — every kind — becomes groupable) and
[2026-08-18-reasoning.md](2026-08-18-reasoning.md) (thoughts stop being tool
rows and render as prose).

## Problem

A working turn is a wall. Every tool call charges a full row, thoughts charge
rows too, and a busy turn scrolls the conversation away. Same-kind grouping
helped but most turns are mostly `bash`, which never groups, so the win rarely
lands. Scrollback of a finished session reads as noise with answers buried in
it.

## Desired outcome

Codex-style. A finished turn is two things: one collapsed row —
`Worked for 1m39s ›` — and the final message. Everything else the turn did
lives inside that row, one click away. A running turn shows its work live;
resolution collapses it.

## In scope

- The turn accordion: grouping every non-final block of a turn under one
  toggle row.
- Widened run grouping inside the accordion (mixed kinds, all kinds).
- Thought rows re-rendered as muted italic prose.
- One-line clamp on tool rows.
- Navigation (j/k, leap, READ) over the new shapes.

## Out of scope

- Session log, persistence, replay — this is a projection, same contract as
  `ledger-groups`. The rows keep their ids and order.
- Subagent internals: an agent row's nested children keep today's rendering
  inside whatever container they land in. No extra indent anywhere — the
  accordion is a visibility toggle, not a layout change.
- Turn footer metadata (tokens, cost) — unchanged, wherever it draws today.

## Settled decisions

### One accordion per user turn

Everything between the user's message and the turn's final assistant message
goes inside: tool rows, groups, thoughts, **and mid-turn assistant text**.
Only the final message stays outside. Members render exactly as they do
today — same x-position, no added indent.

### Collapse states

- **Running:** open, header ticks live — `Working for 12s…`.
- **Resolved:** collapses, however it resolved. Errored and aborted turns
  collapse too, with status on the row: `Worked 40s · aborted ›`.
- The reader's manual toggle always wins over the default, same contract as
  `groupShown`.

### The collapsed row is bare

`Worked for 1m39s ›`. No digest, no counts. Duration is wall time from the
user's send to resolution.

### Grouping widens: contiguous runs, every kind

Inside the accordion, a run is a contiguous stretch of tool rows between
thoughts / text / non-joinable rows. Kinds mix; the summary reuses
`countedAs` per kind, in first-appearance order:
`read 2 files · edited 1 file · ran 3 commands`.

**Every kind is groupable, present and future — grouping is opt-out, not
opt-in.** This reverses two written exclusions knowingly: `bash` ("two
commands are two different things") and `skill` join runs, because the
accordion already hides everything by default — a whole row inside a closed
accordion protects nobody, and expand shows each call.

The two breakers that remain, unchanged from `ledger-groups`:

- A failed / denied / cancelled row stays a whole row and breaks its run. A
  red fact is never counted into a green summary.
- An approve/ask card is its own block and breaks by existing.

### Thoughts are prose

A thought renders as a muted, italic chat-style message — not a tool row, no
gutter icon, no clamp: full text always. Thoughts separate runs; they are the
narration between the work.

### Tool rows clamp to one line

Any row whose label wraps today truncates to one line with ellipsis. The
expanded body (`ToolBody`) is where the full text lives, as now.

### Navigation

A closed accordion is one j/k stop. Open, its members are stops (groups
still collapse to one stop each until opened). One shared `shown()` seam
decides drawing **and** the stop list — the leap-ring bug happened once
because two callers disagreed; they must ask the same function.

## Acceptance behavior

- Send a message; while pi works the accordion is open and its header ticks
  `Working for Ns…`; groups and thoughts stream in as today, un-indented.
- The final message lands: the accordion collapses to `Worked for 1m39s ›`
  followed by the final message. Clicking (or the nav expand key) reopens it;
  it stays open until closed again.
- Abort a turn with Escape: it collapses to `Worked 40s · aborted ›`.
- Inside an expanded accordion, the sequence thought → read → write → grep →
  edit → thought → bash ×3 draws as: prose, one group row
  (`read 1 file · wrote 1 file · 1 search · edited 1 file`), prose, one group
  row (`ran 3 commands`).
- A failed bash call draws as its own red row between two groups, never
  summarized.
- Mid-turn assistant text appears inside the accordion when expanded, hidden
  when collapsed.
- Thought text shows in full, muted and italic, reading as a message.
- No tool row occupies more than one line collapsed.
- j on a collapsed accordion steps over it in one press; leap can land on it;
  expanding it makes members reachable.

## Constraints

- Pure projection: `ledger-groups`-style pure functions own run-building and
  accordion membership; components read them. Tests need no DOM.
- The 350-line ceiling holds — the accordion is its own component, not growth
  inside `ThreadView`.
- Live groups/accordions default open, resolved default closed, reader choice
  wins — one contract everywhere.

## Risks

- Hidden red rows: a failure inside a *collapsed* accordion is invisible until
  expanded. Mitigation considered (status digest on the row) was declined for
  bareness; the error/abort status label on the row is the only signal.
- Virtualization: collapsing a long turn changes measured heights in bulk;
  the scroll pin must survive a collapse landing above the viewport.
- Wall-time duration includes approval waits — a turn that sat on an approve
  card for ten minutes says `Worked for 10m12s`. Accepted; it is what the
  reader experienced.

## Open questions

- None blocking.
