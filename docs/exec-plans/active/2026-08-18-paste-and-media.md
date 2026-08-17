# Paste and media — tickets

Spec: [2026-08-17-paste-and-media.md](../../specs/2026-08-17-paste-and-media.md)

Status legend: `todo` · `in-progress` · `done`.

## P1 — a big paste folds into a token — `done`

> Pure model first: when to fold, what the token says, how it unfolds on send.

- `src/renderer/src/lib/paste.ts` — `shouldFold(text)` at 8 lines or 400
  characters; `foldToken(id, text)` producing `[pasted 412 lines]`;
  `spliceFolds(text, folds)` restoring every token to its content at its
  position; `foldsIn(text, folds)` dropping any whose token the user deleted.
- Acceptance: a 3-line paste does not fold; a 500-line one does; sending splices
  the original text back at the token's position; deleting the token drops it.
- Validation: `paste.test.ts` at both thresholds, multiple folds, out-of-order
  tokens, a token the user edited.

## P2 — a pasted screenshot becomes an attachment — `done`

> Bytes from the paste event, a file in main, the existing chip row.

- `src/shared/commands.ts` — `stageImage({ data, mime })` returning an
  `AttachmentRef`.
- `src/main/session/staged-images.ts` — writes to a session-scoped temp
  directory, names the file `pasted-<n>.<ext>`, and removes the directory when
  the session ends.
- `Composer.svelte` — `onpaste` reads `event.clipboardData.files` for images and
  calls the command; text falls through to P1.
- Acceptance: pasting a screenshot shows a removable chip with a thumbnail and
  the model receives the image; `open ↗` opens the staged file.
- Validation: `staged-images.test.ts` for naming, extension and cleanup; a
  manual paste pass.

## P3 — the composer draws chips — `done`

> A mirror behind the textarea. Decorates, never re-flows.

- `src/renderer/src/lib/composer-segments.ts` — `segment(text, folds)` splitting
  the string into plain runs, mention chips (`@path`) and paste chips.
- `src/renderer/src/components/composer/Mirror.svelte` — draws the segments;
  chips use `background` and `outline` only.
- The textarea's text becomes transparent with a visible caret; both share one
  metrics class.
- Acceptance: `@src/app.ts` shows as a chip, the caret walks it character by
  character, and selection covers the same glyphs.
- Validation: `composer-segments.test.ts`; a browser pass measuring that the
  mirror's text box matches the textarea's.
- Blocked by: P1

## P4 — the sent message shows what travelled — `done`

> §10: chips flow with the text and expand.

- `src/renderer/src/components/thread/MessageChips.svelte` — a mention or an
  attachment chip inside a sent message; an image expands to a preview with
  `open ↗`, a text file or a fold to a monospace block.
- Acceptance: a message with a mention, an image and a fold renders three chips;
  each expands to the right thing.
- Validation: block-model tests; a visual pass against §10.
- Blocked by: P2, P3

## P5 — an image the agent read is an image — `done`

> One family for every picture in the transcript.

- `src/shared/protocol.ts` — a `tool-body` of type `image`.
- `src/main/session/tool-image.ts` — a `read` on a known image extension emits a
  data URI, or the size when the file is over 2 MB.
- `src/renderer/src/components/thread/ImageBody.svelte` — one component, shared
  with markdown images and message chips.
- Acceptance: a read of `mock.png` draws the picture; a 5 MB image draws its
  size instead; a failed read draws nothing.
- Validation: `tool-image.test.ts` for extensions, the cap and failure; a visual
  pass.
- Blocked by: P4

## Order

P1 → P2 → P3 → P4 → P5

## Review — 2026-08-18

- **P1 — a pasted screenshot left no trace in the sent message.** Images travel
  as bytes, which carry no filename, so the model could not refer to one and
  the message — which is only its text — showed the reader nothing of what they
  had attached. The prompt names them now, which also puts them in replay.
- **P2 — chips left their words behind whenever the composer scrolled.** Found
  by measuring rather than by reading: field at 200, mirror at 0. This is the
  one invariant the mirror exists to hold.
- **P2 — the field's scrollbar narrowed the textarea and not the mirror.**
  Measured at 502 against 494. Reserving a gutter on both only moves the
  problem, because `stable` reserves on an `overflow: hidden` box and reserves
  nothing where scrollbars are overlays. The scrollbar is gone from both.
- **P2 — backspace inside a chip took one character**, broke the token, dropped
  the paste and left its characters behind as literal text. A chip is one thing.
- **P2 — a staged screenshot had no thumbnail and no way to open it.**
- **P3 — the composer and the transcript disagreed about what a mention is**, so
  `@alice` was a chip while typed and plain text once sent. One rule now.
- **P3 — `spliceFolds` rewrote its own output**, so a paste containing an
  earlier chip's token had that token replaced a second time.

Two spec promises were unmet and are now built rather than amended away: `cmd+z`
restores a folded paste (native undo cannot — the fold is applied by
assignment), and a caret inside a token opens a peek showing what was pasted.

`Composer.svelte` crossed 350 twice and split at real seams: `composer/Field.svelte`
holds the textarea and its mirror, because they share one invariant and belong
in one file; `composer-send.ts` holds what pressing ⏎ does.
