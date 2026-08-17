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

## P3 — the composer draws chips — `todo`

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

## P4 — the sent message shows what travelled — `todo`

> §10: chips flow with the text and expand.

- `src/renderer/src/components/thread/MessageChips.svelte` — a mention or an
  attachment chip inside a sent message; an image expands to a preview with
  `open ↗`, a text file or a fold to a monospace block.
- Acceptance: a message with a mention, an image and a fold renders three chips;
  each expands to the right thing.
- Validation: block-model tests; a visual pass against §10.
- Blocked by: P2, P3

## P5 — an image the agent read is an image — `todo`

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
