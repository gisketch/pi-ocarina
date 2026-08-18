# Reasoning visualization — tickets

Spec: [2026-08-18-reasoning.md](../../specs/2026-08-18-reasoning.md)
Mockup: `docs/reference/design/PiOcarina Polish.dc.html` §05.

Status legend: `todo` · `in-progress` · `done`.

## R1 — thinking crosses the seam — `done`

> pi's thinking becomes a typed `reasoning` block, live and in replay.
> Nothing renders yet.

- First: verify against pi 0.84.x whether thinking arrives as streaming
  deltas or whole parts (the spec's open question). **Answered: deltas.**
  `message_update` carries an `assistantMessageEvent` whose union includes
  `thinking_start`, `thinking_delta` and `thinking_end` (pi-ai `types.d.ts`),
  and the session log stores a `ThinkingContent` part. So the tail line is
  genuinely live, and replay reconstructs the same block from the stored part.
- `src/shared/vocabulary.ts` — a `reasoning` block kind: text, duration,
  optional token count, `streaming` flag.
- `src/main/session/pi-translate.ts` — thinking parts stop being ignored;
  they become one reasoning block per assistant message, preceding its text
  block. Duration measured between first and last thinking event; tokens from
  usage when present.
- Replay reconstructs the same blocks from the session log.
- Acceptance: a thinking model's turn yields `reasoning → agent` blocks with
  the same shape live and replayed; a non-thinking model yields no empty
  shells.
- Validation: translator tests with thinking fixtures, live and replay.

## R2 — the reasoning block, drawn — `done`

> Mockup §05 exactly: 2px left rule, darkest gray, collapsed tail line,
> expanded plain block, streaming header.

- New `src/renderer/src/components/thread/ReasoningBlock.svelte`.
- Collapsed: `▸ REASONING · 4.2s`, tail line = latest thought, ellipsized
  from the left, one line. Expanded: `▾ REASONING · 4.2s · 812 tok` and the
  full text — plain, no markdown, muted below tool-row strength in both
  themes.
- Streaming: blinking mark + `streaming…`, tail line updates live with a
  caret; full text streams only while expanded.
- Virtualization: collapsed blocks are fixed-height; expanding re-measures
  only itself.
- Acceptance: all three states match the mockup; contrast stays below the
  answer's in both themes.
- Validation: component render via browser pass with screenshots of the
  three states.
- Blocked by: R1.

## R3 — toggles that persist — `done`

> Click toggles a block, `o` toggles the world, both remembered.

- `⏎` (or click) on the focused reasoning block toggles it; per-block state
  lives with the thread and survives a switch away and back.
- `o` flips the global default (open/closed) for all reasoning blocks;
  persisted in preferences; blocks with a per-block choice keep it.
- `j`/`k` stop on reasoning blocks, collapsed or not; leap indexes the
  reasoning text.
- `o` must not collide with existing bindings. **It was unbound**, so `o` in
  NORMAL is the global toggle; click (or `⏎` on the focused block) toggles one.
- Acceptance: toggle one block, `o` flips the rest; keyboard-only pass
  touches every state.
- Validation: state tests for the per-block/global interaction; browser pass.
- Not yet done: persisting the global default across a restart. It lives in
  memory today, so `o` survives a thread switch but not a relaunch.
- Blocked by: R2.
