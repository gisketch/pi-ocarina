# Spec: Turn Structure (H)

Source: a bug report on 2026-08-16, after reading a real multi-tool turn back
from disk. Parent: [piocarina-architecture.md](piocarina-architecture.md).
Amends the projection rules in
[2026-08-15-thread-ledger.md](2026-08-15-thread-ledger.md), which is frozen.

## Problem

A turn where the agent uses tools reads two different ways depending on whether
you watched it or reopened it.

Verified against a real session file: **pi splits a tool-calling turn into a
chain of assistant messages, and all but the last carry no text.** One turn with
seven tool calls was stored as seven assistant messages of `thinking` and/or
`toolCall` with no text part, then one final assistant message of text alone.

The two projections disagree about what to do with a text-less message:

- **Live** starts an agent block on every assistant message, before it knows
  whether text will follow. A text-less message therefore renders an empty
  `PI` label, and because the ledger only continues when the previous block is
  a ledger, it also splits the run of tool calls. The turn reads
  `PI · tool · PI · tool · PI · tool · PI text`.
- **Replay** only produces an agent block for a text part. The same turn reads
  `tool tool tool · PI text` — no labels, one ledger.

Neither is what the turn was. An empty `PI` announces that the agent said
something when it said nothing, and it breaks the ledger into unrelated-looking
fragments. This also violates the standing rule that one reducer serves both
sources: watching a thread and returning to it must not differ.

## Outcome

A turn reads the same whether it is streaming or restored, and it reads as what
it was: the agent speaks only where it spoke, and a run of tool calls is one
ledger.

## Settled decisions

- **An agent block exists only once there is text for it.** Starting a message
  is not evidence the agent said anything; the first text is. This is the one
  rule that fixes both projections, because it removes the difference between
  them.
- **A run of tool calls uninterrupted by agent text is one ledger**, however
  many assistant messages pi split it across. The message boundary is pi's
  accounting, not something the reader needs to see.
- **Thinking stays dropped**, live and on replay, as today.
- **A message carrying both text and tool calls keeps its order**: the text
  block first, then the ledger. No model in use does this today, but the rule
  must not depend on that.
- **`ls` and `find` stay `raw` rows.** They have no row in the design, and a
  raw row is honest where a mislabelled one is not. This is existing, correct
  behaviour and is named here only because it appears in the same screenshots.

## In scope

The projection of assistant messages and tool calls into blocks, in both the
live translator and replay, and whatever the reducer needs so the two agree.

## Out of scope

- The visual design of a ledger row or a message.
- Subagent nesting, which has its own spec and is unaffected.
- Checkpoint density (one per user message), which is a separate question.

## Acceptance criteria

- A turn of N tool calls with a closing summary renders as one ledger of N rows
  followed by one `PI` message, live and on replay.
- The same thread, watched and then reopened, produces the same blocks in the
  same order with the same kinds. This is asserted as an equality, not by eye.
- A turn where the agent speaks, uses tools, then speaks again renders
  `PI text · ledger · PI text` — three blocks, in that order.
- No block renders an agent message with empty text, from either source.
- A tool call still streams a row the moment it starts; nothing waits for the
  turn to end.
- An interrupted turn still settles its open rows as cancelled, as today.

## Validation

- Reducer fixtures for: tools only, tools then text, text then tools, text only,
  and several text-less messages in a row.
- A same-projection test that feeds one recorded turn through the live
  translator and through replay and asserts the two block lists are equal. The
  existing "replay matches live" test is the place for it.
- One live pi test that runs a real multi-tool turn, then reopens the thread and
  compares the two projections.

## Risks and open questions

- The equality test is only as good as the fixture. A model that interleaves
  text and tool calls inside one message would exercise a path no current model
  produces; the fixture must include it deliberately rather than waiting for a
  model to do it.
- Deferring the agent block until its first text means a message that ends up
  with no text leaves nothing behind. That is the intent, but it also means an
  agent message that is *only* an error or a stop reason must still surface
  through the thread-state path rather than as an empty block.
