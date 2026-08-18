# Reasoning, visible

Status: **Approved 2026-08-18.** Decisions settled in the Polish mockup
(`docs/reference/design/PiOcarina Polish.dc.html`, section 05). Tickets in
[2026-08-18-reasoning.md](../exec-plans/active/2026-08-18-reasoning.md).

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

## Decisions (settled by the mockup, 2026-08-18)

1. **Shape**: a 2px left rule and the darkest gray text — margin notes, not
   content. No markdown rendering inside reasoning; plain muted text keeps it
   visually below tool rows.
2. **Collapsed shows the tail**: one quiet line with the *latest* thought,
   ellipsized from the left — a glance says where pi's head is. The header
   reads `▸ REASONING · 4.2s` collapsed and adds token count expanded
   (`4.2s · 812 tok`). Duration is measured wall-clock between the first and
   last thinking delta; tokens come from pi's usage if present, else omitted.
3. **Streaming**: the header shows a blinking mark and `streaming…`; the tail
   line updates live with a caret. Full text streams only when expanded.
4. **Toggle**: click (or `⏎` on the focused block) toggles one block; `o`
   toggles globally. Per-block state persists per thread; the global default
   persists in preferences.
5. **Traversal**: `j`/`k` stop on reasoning blocks like any block, collapsed
   or not.

## Open questions (small, settle in implementation)

- Whether pi 0.84.x delivers thinking deltas or whole parts decides how live
  the tail line is — verify against the events first, record in the plan doc.
