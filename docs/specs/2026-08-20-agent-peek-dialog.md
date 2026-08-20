# Agent Peek: Live Figures, Model, and a Floating Column

**Status: implemented 2026-08-20.** Amends the subagents spec
([2026-08-15-subagents.md](2026-08-15-subagents.md)) — the peek's contract
(one at a time, `l`/`h`/`x`, reads the thread fresh each paint) stands; this
changes what the peek shows and what it looks like.

## Problem

The peek exists to answer *is this child stuck, and what is it costing me?*
Today it answers neither well:

1. **The token figure is dead while the child runs.** A child's usage is
   accumulated inside the drive loop and only handed back when the turn ends,
   so the renderer's entry holds zeros from spawn to settle. The peek reads
   `0 tokens · $0.0000` for the entire run — the one window in which the
   reader opened it — then jumps to the true figure the moment the child no
   longer matters.
2. **The model is invisible.** A spawn may name a model, a role may name one,
   and main may silently fall back to the session's own when the named one is
   not configured. Which model a child *actually* runs on is decided in main
   and told to nobody. The reader watching a slow or expensive child cannot
   see the single fact that most explains both.
3. **The surface is a cramped corner box.** The peek is a small
   absolute-positioned card pinned bottom-right, with the child's calls as
   bare text lines. It reads like a tooltip, not like the monitor the
   subagents spec designed it to be.

## Desired outcome

The peek becomes a floating dialog shaped like a chat column: the child's
brief, its calls, and its report rendered with the same vocabulary as a
thread column, floating over the strip. While the child runs, its token and
cost figures count up live, and its header names the model it is actually
running on.

## In scope

- Live usage: the entry's usage updates in the renderer as the child works,
  not only at settle.
- The effective model — after any fallback — carried on the entry and shown
  in the peek.
- The peek rebuilt as a floating chat-column dialog.

## Out of scope

- The agent *row* under the spawn call: unchanged. The row is one line and
  stays one line; the model lives in the peek.
- The spawn API (`SpawnRequest`), roles, caps, slots, cancellation: unchanged.
- Steering or messaging a running child from the peek. It remains a monitor
  with one destructive key.
- More than one peek at a time.

## Settled decisions

### 1. Usage streams as `agent-update`

Main emits an `agent-update` for the child after each assistant message
completes, carrying the entry with a fresh copy of the running usage. No new
event kind: `agent-update` already exists and the renderer already applies it
by replacing the entry. Cadence is one event per model message — a child
makes tens of these per run, not thousands, so no coalescing is needed.

The settle path is unchanged and remains the authoritative final figure; the
spend book still charges once, at settle. The live updates are display only
and must never double-charge the thread's bill.

### 2. The entry carries the effective model

`AgentEntry` gains a `model` field: the id of the model the child's session
was actually created with — after the role's default, the spawn's override,
and the not-configured fallback have all been applied. Stamped in main when
the session is created and sent with the started `agent-update`, so a
fallback is visible as itself: the entry says the model the child truly runs
on, and the existing fallback warning still tells the parent why.

Absent on entries recorded before this change; the peek shows nothing rather
than guessing.

### 3. The peek is a floating chat-column dialog

The peek renders as a floating column over the strip — the same dialog-shell
idea the diff viewer and the telescopic picker wear: centered, elevated,
sized like a column (not a corner card), the strip visible but dimmed-by-step
behind it (borderless-chrome rules apply; separation is a background step,
never a border).

Inside, the child reads like a small transcript:

- **Header**: identicon, name, role, model, status mark, live elapsed time.
- **Brief**: the task label and the label line, styled like a sent message.
- **Calls**: the child's tool rows drawn with the ledger's row vocabulary
  (tool label grammar, live pulse on a running call, nested children
  indented) rather than bare text. This region gets the room and the scroll.
- **Report**: the child's final output rendered as markdown, styled like an
  assistant message. Absent while running or cancelled, as today.
- **Footer**: live `tokens · cost`, and the key hints (`x stop · h close`).

The key contract is unchanged: `l` opens on a focused agent row, `h` and
`escape` close, `x` confirms then stops a running child, and every other key
falls through to the shell — the peek stays somewhere to look from, not a
mode. It still holds an id, not a snapshot, and still closes itself when the
row it points at goes away or thread focus leaves its column.

## Acceptance criteria

1. Open the peek on a running child: the token and cost figures increase
   while it works, without closing and reopening the peek. The final figure
   equals the settled entry's figure.
2. The peek header shows the model id the child's session was created with.
   When the role names a model this machine does not have, the peek shows the
   fallback model actually used, and the existing warning still fires.
3. The peek draws as a centered floating column over the strip, with the
   child's calls rendered as ledger-style rows and its report as markdown.
4. `l`/`h`/`escape`/`x` behave exactly as before; keys the peek does not
   claim still reach the shell while it is open; the thread's spend total is
   unchanged by watching (no double charge).
5. Entries recorded before this change (replayed threads) still open in the
   peek, with no model line.

## Validation

- Main: a fleet test asserting an `agent-update` per assistant message with
  strictly growing usage, and that the spend book is charged exactly once.
- Main: a factory/fleet test asserting the entry's `model` equals the
  resolved model, including the fallback path.
- Renderer: peek state tests for the unchanged key contract stay green; a
  component-level check that the dialog renders rows and report from a live
  entry.
- Visual: `pnpm dev:web` against the design reference; motion judged in the
  Electron window.

## Risks and open questions

- **Event volume**: one update per assistant message is small, but a
  degenerate child looping on tiny messages would chatter. Accepted; revisit
  with coalescing only if seen live.
- **Model id length**: provider-qualified ids can be long; the header
  truncates with the full id on hover/title. Display detail, decided at
  implementation.
- **Open question — scrim depth**: how dimmed the strip reads behind the
  dialog is a design call within the borderless-chrome rules; at the
  implementer's discretion against the reference.

## As built

- The started `agent-update` is emitted *after* the child's session exists
  rather than before, because that is when the model is settled. The row still
  opens at `tool-start`, so a child that fails to start still has somewhere to
  say so, and the clock still starts when the child does.
- Live usage arrives through an `onUsage` callback on the drive loop, one per
  closed assistant message, always a copy. The spend book is still charged
  once, at settle.
- Model resolution moved out of the session factory into its own `ModelBook`,
  which now answers every "which model" question and reports which one won.
  The fleet's wiring helper moved out too. Both files were at or over the
  350-line smell; the split is by responsibility, not by size.
- The dialog grows with the child between a floor and a ceiling rather than
  reserving a fixed column of empty room.
