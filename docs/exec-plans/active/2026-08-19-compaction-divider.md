# Compaction divider — one quiet line, and the transcript stays

Reported 2026-08-19: the compacting stripe looked wrong (green shimmer, `⌫`
glyph), the finished card dumped the whole machine summary into the chat, and
collapsing the history behind it read as the app deleting the conversation.

## Decision

A compaction folds **pi's context, never the reader's transcript.**

- Running: one divider line — a pulsing `compact` icon (codicons archive, the
  same `pulse` breath the turn footer's square takes) and
  `compacting conversation · 12s`, ticking on the shared `clock`. The block's
  mount time stands in for the start; events carry no clock of their own.
- Done: one divider line — `compacted · 116k tok saved`. No summary: the
  summary pi writes is for the model, the reader's record is the conversation
  itself. Falls back to `ctx 82% → 24%` for recordings without token counts.
- Skipped: `not compacted · <reason>`, unchanged in substance.
- **Nothing collapses.** `collapsedBefore`, the expand/collapse control, and
  the block slicing in `ThreadView` are deleted.
- Auto-follow needs nothing: a compaction block is an arrival like any other,
  so the pin already keeps it in view when following.

## Changed

- `src/shared/protocol.ts` — `compaction-done` carries `tokensSaved?`.
- `src/main/session/pi-translate.ts` — computed from pi's `tokensBefore` −
  `estimatedTokensAfter`; percentages need the window, the saving does not.
- `src/renderer/src/lib/thread.ts` — block carries `tokensSaved?`;
  `collapsedBefore` deleted.
- `src/renderer/src/components/thread/Compaction.svelte` — rewritten to the
  three lines above.
- `src/renderer/src/components/thread/ThreadView.svelte` — collapse machinery
  removed; every block above a divider renders.
- `src/renderer/src/lib/icons.ts` — `compact` (codicons `archive`).

## Validation

Reducer keeps every block above the divider (`thread-reducer-state.test.ts`),
adapter reports `tokensSaved` (`pi-translate-turn.test.ts`). Full suite and
`pnpm run check` green. Live pass owed: run `/compact` in a real session.
