# Paste and media: what the clipboard brings in, and what images look like

Status: **APPROVED 2026-08-18.** Grilled 2026-08-18. Tickets in
[2026-08-18-paste-and-media.md](../exec-plans/active/2026-08-18-paste-and-media.md).

Builds on the composer spec
([2026-08-15-composer-controls.md](2026-08-15-composer-controls.md)), whose D4
shipped drag-drop attachments and D3 shipped `@`-mentions. This spec covers the
intake paths they left out — the clipboard and large text — and the rendering
side: chips and images, wherever they come from.

Visual truth: `PiOcarina Components.dc.html` §10.

## Problem

**Intake.** The clipboard is the fastest way to hand the agent something, and
the composer ignores it. A screenshot has no path on disk, so drag-drop can
never carry one. And pasting a 400-line stack trace buries the reader's own
question under text they must then scroll past.

**Rendering.** The design shows mentions and attachments as chips flowing with
the text. Ours are plain text. And when pi reads a `.png`, the ledger shows a
text row for a thing that is a picture — the reader watches the agent look at an
image they cannot see.

## Desired outcome

Paste a screenshot, it becomes an image chip. Paste a wall of text, it becomes
one chip and the composer stays readable. Mentions look like chips, as the
design draws them. Wherever an image is in play — attached, pasted, or read by
the agent — the transcript shows the image.

## Settled decisions

### 1. Chips are drawn over the textarea, never inside it

> **Superseded 2026-08-19.** The mirror could only give a chip what the text
> donated: an icon had to stand on a character cell, a gap had to *be* a
> character — so marks came out tiny, uneven, and absent at position 0, and a
> chip visually absorbed the space before it. The composer is now a
> `contenteditable` whose chips are real atomic elements; the invariant that
> replaced glyph alignment is DOM-to-string serialization (`chip-field.ts`).
> See [2026-08-19-chip-fidelity.md](../exec-plans/active/2026-08-19-chip-fidelity.md).

The design draws chips inline with the text. Our composer is a real
`<textarea>`, and it stays one: native editing, native undo, native IME. Chips
come from a **mirror** — a div behind the textarea rendering the same string,
with the textarea's own text transparent above it.

The rule that makes this safe: **the mirror decorates, it never re-flows.** A
chip is drawn with `background` and `outline` only — never padding, margin or
border, all of which would move the glyphs and drift the caret. The mirror and
the textarea share one class for every metric that affects layout.

So a chip's text is the text. `@src/app.ts` is nine characters in both, in the
same place, in the same font. Nothing can slip.

### 2. A big paste becomes a readable token, not a hidden one

Past **8 lines or 400 characters**, whichever comes first, a paste is replaced
in the textarea by the literal text `[pasted 412 lines]`, and the pasted content
is held beside it. The mirror draws that token as a chip. On send, the token is
replaced by the real text at exactly the position it occupied.

The token is human-readable on purpose. A zero-width sentinel would be invisible
to the caret, to selection, and to the reader — this one can be seen, selected,
and deleted like any other word, and deleting it drops the paste with it.

Both thresholds, because either alone misses a real case: 8 lines catches a
stack trace, 400 characters catches a single-line minified blob.

`cmd+z` immediately after the fold restores the plain text.

### 3. A pasted image becomes a real file in main

pi takes text and images. The image bytes arrive in the renderer inside the
paste event — the renderer is not reading the disk, so the seam holds — and are
handed to main, which writes them to a session-scoped temporary directory and
returns an `AttachmentRef` with a real path.

Everything downstream is then unchanged: `readImages` reads by path, the chip
row already knows how to show and remove one, and `open ↗` has a file to open.
One new command, no new transport.

### 4. Text still travels as text

A folded paste is sent as message text. pi has two channels, text and images,
and staging text as a temporary file would make the agent spend a `read` call on
content we already hold, and leave files behind.

### 5. An image the agent reads is drawn as an image

A `read` whose path ends in a known image extension gets an `image` body: main
reads the bytes and emits a data URI. Bounded like every other body — over 2 MB
the row says the size instead of drawing it. Extension-based, and only when the
read succeeded: we never invent an image for a call that failed.

### 6. One image family

A markdown image in an answer, an attached image, a pasted image and an image
the agent read all render through one component at one size, expanding the same
way. Four different-looking previews for the same thing would be four bugs
waiting to be reported.

## In scope

- Clipboard images: `cmd+v` stages a chip, previews it, removes it, sends it.
- Large-paste folding to a token, with the threshold, undo, and send-time
  splicing.
- The composer mirror: mention chips and paste chips.
- Chips in the sent message, per §10, expanding to a preview or a monospace
  block.
- Image bodies for reads.

## Out of scope

- Editing, annotating, or interpreting images. Preview only; `open ↗` hands off
  to the operating system.
- Video, audio, PDF.
- Pasting a file copied in Finder (a path on the clipboard).
- Rich-text paste. Pasted HTML is taken as its plain text.

## Acceptance behavior

- A screenshot pasted into the composer becomes a chip with a thumbnail; sending
  it lets the model answer questions about it; the sent message shows it.
- A 500-line paste becomes one `[pasted 500 lines]` chip; the composer stays
  short; sending delivers all 500 lines at that position.
- A three-line paste stays plain text.
- `cmd+z` after a fold restores the plain text.
- `@src/app.ts` renders as a chip in the composer and in the sent message, and
  the caret moves through it character by character.
- A read of `mock.png` shows the picture in the ledger.
- Deleting the token or the mention with `backspace` removes it cleanly.

## Constraints

- The renderer reads no files. Clipboard bytes come from the event; everything
  else is a path main resolves.
- Staged clipboard files live in a session-scoped temporary directory and are
  removed when the session ends.
- The mirror never affects layout. Any style that changes metrics is a bug.
- Image bodies respect the ledger's existing body cap: a bounded thumbnail in
  the row, never a full-size texture in a virtualized list.

## Validation

- Unit: the fold threshold at its boundaries, splicing on send, undo, token
  deletion, and the mirror's segmentation of text into plain runs and chips.
- Unit: image extension detection, the size cap, and the staging command.
- Visual pass against §10 for composer chips and sent-message chips.
- A live pass: the model answers a question about a pasted screenshot.
