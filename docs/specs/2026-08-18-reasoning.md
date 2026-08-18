# Reasoning, visible

Status: **NEED GRILLING.** High-level. Not an approved contract.

## Problem

pi thinks and PiOcarina throws it away. The translator joins a message's text
parts and explicitly ignores thinking content, so a model configured for
extended reasoning shows nothing between the user's message and the answer —
the app looks stalled during exactly the moments the model is doing its most
expensive work.

## Desired outcome

Reasoning is visible but never loud. While the model thinks, the reader sees
that it is thinking and can watch the words if they choose. Afterwards, the
reasoning survives as a muted, collapsed block they can open. One key toggles
the whole behavior for readers who never want it.

## What the industry does (read before grilling)

- **Claude apps** show a live "Thinking…" affordance streaming the latest
  reasoning line, collapsing to a small disclosure ("Thought for 12s") when
  the answer starts. The collapsed header carrying *duration* reads as
  progress, not noise.
- **ChatGPT (o-series)** shows a rotating one-line summary of the current
  reasoning phase, expandable afterwards.
- **Terminal harnesses** (Claude Code, Codex CLI) stream reasoning dimmed
  inline, or hide it behind a verbosity toggle.

The shared rules: reasoning is **visually subordinate** to the answer (muted,
smaller, indented — some combination); it is **collapsed by default** once
the answer exists; the **live state shows motion** so the app never looks
hung; expansion is **cheap and local**.

## In scope

- Translating pi's thinking content across the seam as its own block kind.
- Live rendering while thinking streams, and the collapsed form after.
- Expand/collapse per block, and a global toggle (`o` is the candidate key)
  for always-open.
- Replay: reasoning blocks reconstruct the same way from the session log.

## Out of scope

- Summarizing or interpreting the reasoning.
- Rendering interleaved/redacted thinking signatures beyond showing the text
  pi provides.
- Per-model configuration of whether reasoning is requested — that is the
  model selector's business.

## Acceptance behavior

- A thinking model shows a live, muted indication with the current reasoning
  text while it thinks; the transcript never looks stalled during reasoning.
- When the answer begins, the reasoning collapses to one muted line; the
  answer renders at full strength.
- The collapsed line expands and collapses from the keyboard on the focused
  block, and by pointer.
- The global toggle flips default visibility for the whole app and persists.
- A model with no thinking content renders exactly as today — no empty shells.
- Replay of a session with reasoning matches live rendering.

## Constraints

- Thinking crosses the seam as typed vocabulary, never as a pi shape.
- The transcript is virtualized; a collapsed reasoning block must be cheap,
  and expanding one must not re-measure the world.
- Muted means muted in both themes — the block must never out-contrast the
  answer.
- Leap and `j`/`k` treat a reasoning block as a real block; the grill decides
  whether collapsed ones are skipped.

## Validation

- Translator tests: thinking parts become reasoning blocks, live and replay.
- Projection tests for the collapse state machine.
- A browser pass with a thinking model: live stream, collapse, `o`, replay.

## Questions the grill must answer

1. Does the collapsed header show duration ("thought for 12s"), a first line,
   or just the word — and where does duration come from?
2. Is `o` per-block on focus and `O` global, or one global toggle only?
3. Do `j`/`k` stop on collapsed reasoning blocks, or skip them?
4. During live streaming, does the full reasoning stream by default, or only
   the latest line with expansion opt-in?
5. Does pi 0.84.x deliver thinking deltas during streaming, or only complete
   thinking parts at message end — and what does that force on the live form?
