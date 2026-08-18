# Chat polish — tickets

Spec: [2026-08-18-chat-polish.md](../../specs/2026-08-18-chat-polish.md)
Mockup: `docs/reference/design/PiOcarina Polish.dc.html` §03–04.

Status legend: `todo` · `in-progress` · `done`.

## C1 — the follow-state machine — `todo`

> Pure logic first: pinned, paused, unseen count, re-arm. No DOM.

- New `src/renderer/src/lib/follow.ts` — a small machine fed
  `scrolled(top, height, total)` and `arrived(n)`; exposes `following`,
  `unseen`, `jump()`. Bottom threshold 48px, from the mockup.
- Rules: any upward scroll pauses instantly; scrolling back within the
  threshold re-arms silently and zeroes `unseen`; `jump()` re-arms and zeroes;
  arrivals while paused increment `unseen`; arrivals while following do not.
- Programmatic pin scrolls must not be mistaken for the reader's (the mockup
  guards this with a suppress flag — same idea here).
- Acceptance: the rule table above as tests, including the suppress case.
- Validation: `follow.test.ts`.

## C2 — the thread follows, the pill returns — `todo`

> Wire the machine into the thread column; draw the pill and the status dot.

- `ThreadColumn.svelte` owns one machine per column (spec: pin state is per
  column) and pins on new block content while following.
- The pill, per mockup §03: centered over the bottom, `↓ N new · jump to
  latest · G`; rendered only when paused *and* `unseen > 0`; click or `G`
  jumps. `G` still means end-of-thread when already following — one key, one
  destination.
- Statusline: `FOLLOWING` with a pulsing dot / `PAUSED` static — wired to the
  focused column's machine.
- Sending a message always jumps.
- Acceptance: stream a long turn — view pins; one wheel-up frees it and the
  pill counts; `G` returns; reaching bottom by hand re-arms with no pill
  flash.
- Validation: browser pass against the dev harness, screenshots of both
  states; virtualization unaffected (no per-block layout reads).
- Blocked by: C1.

## C3 — chips inside the sentence — `todo`

> A sent message renders its attachments as chips in the text flow; a chip
> expands to a card below the message.

- User blocks render markdown-inline segments today; attachment names become
  chip segments the way mentions already do — `@`-mention chips and
  attachment chips share one look (mockup §04: icon + name, bordered, inline
  with `vertical-align: baseline`).
- The separate attachment row under a sent message goes away; the message
  text alone carries the chips. A message whose text never names the
  attachment still shows it appended as a trailing chip — nothing attached is
  ever invisible.
- Activating a chip (`click`, or `⏎` with the block focused and chip chosen
  by leap-style letter or cycling) toggles a card under the message: image
  preview or file meta, `expanded from chip`, `open ↗`. Per-chip state,
  stays until closed.
- Acceptance: mockup §04 left panel reproduced with a real send; text files
  and images both expand; `open ↗` opens the file.
- Validation: segment tests for the chip mapping; browser pass with
  screenshots.

## C4 — the thumbnail of what pi saw — `todo`

> A `read` of a staged screenshot draws its thumbnail; today it draws
> nothing because the staging directory is outside the workspace.

- `src/main/session/tool-image.ts` — `imageBody` accepts, besides workspace
  paths, paths inside this app's own staging directory (`StagedImages` learns
  to answer `owns(path)`); the workspace containment rule is otherwise
  untouched.
- The row reads per mockup §04 right panel: `read · screenshot.png · image ·
  W×H`, thumbnail nested under the row, `what pi saw · click to zoom`; zoom
  reuses the existing image viewer.
- Dimensions come from the image header at body-build time (PNG/JPEG/GIF/WebP
  headers only — no decode).
- Acceptance: paste a screenshot, ask pi to read it, see the thumbnail live
  and on replay; a read of `/etc/anything.png` still draws nothing.
- Validation: `tool-image` tests for the allowlist and header parsing; a
  gated live pass.
