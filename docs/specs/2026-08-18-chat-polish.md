# Chat polish: follow the stream, chips in the sentence

Status: **Approved 2026-08-18.** Decisions settled in the Polish mockup
(`docs/reference/design/PiOcarina Polish.dc.html`, sections 03–04). Tickets in
[2026-08-18-chat-polish.md](../exec-plans/active/2026-08-18-chat-polish.md).

## Problem

Three defects in how the conversation reads while it happens.

**The transcript does not follow the agent.** New blocks land below the fold
and the reader scrolls by hand to watch their own conversation. There is no
follow-the-stream behavior at all today.

**Sent chips fall out of the sentence.** The composer renders mentions and
attachments as chips in the text, but a sent message shows attachments on a
separate row. The components mockup is explicit — *"inline attachments —
chips flow with the text; click to expand"* — with `before.png` sitting
inside the sentence and expanding to a preview card with `open ↗`.

**A read screenshot draws nothing.** When pi reads a pasted screenshot the
ledger shows a plain text row, no thumbnail. Suspected cause, to be confirmed
during the grill: pasted screenshots are staged in a temporary directory
outside the workspace, and `imageBody` refuses any path outside the
workspace root — the containment check rejects exactly the directory this
app itself staged the image into.

## Desired outcome

While the agent streams, the newest content is on screen without the reader
touching anything. The moment the reader scrolls up, the transcript is theirs
— and one obvious affordance takes them back to live. Sent messages render
chips inline exactly as the mockup draws them, and a chip expands in place.
Every image the conversation touches — attached, mentioned, or read by pi —
is visible as an image.

## What the industry does (read before grilling)

- **Pinned-to-bottom with sticky release** is universal: ChatGPT, Claude,
  and every terminal follow output until the user scrolls up, then stop.
  Re-pinning happens on an explicit act: the jump control, or sending a
  message.
- **The jump control** varies: a floating `↓` arrow (ChatGPT, Claude), a
  `N new messages` pill (Slack, Discord) that doubles as an unread count,
  terminals' quiet "follow" state. The pill carries more information; the
  arrow is quieter.
- **The release threshold** matters: release only on a real upward scroll,
  and re-pin when the reader returns close to the bottom on their own.
  Fighting the user's scroll position is the one unforgivable failure.

## In scope

- Follow-the-stream: pinning, release on scroll-up, the return affordance,
  re-pin on send and on jump.
- Keyboard access to the jump — this app is keyboard-first; the pill cannot
  be pointer-only.
- Inline chips in sent user messages, per the components mockup, including
  click/keyboard expand to the preview card.
- Fixing the read-screenshot thumbnail, wherever the cause turns out to be.

## Out of scope

- Unread tracking across threads or any badge outside the open thread.
- Redesigning the ledger's image row for workspace files that already draw.
- Smooth-scroll animation tuning beyond "does not fight the reader".

## Acceptance behavior

- With the thread at the bottom, a streaming turn keeps the newest block on
  screen with no input from the reader.
- One upward scroll releases the pin; the transcript then does not move on
  its own, however much arrives.
- A visible affordance appears only while released *and* new content exists
  below; activating it (pointer or key) returns to live and re-pins.
- Sending a message always returns to live.
- A sent message with attachments renders them as chips in the text flow;
  activating a chip expands the preview card in place; `open ↗` still opens
  the file.
- pi reading a pasted screenshot draws the thumbnail in the ledger, subject
  to the same size cap as any other drawn image.

## Constraints

- The transcript is virtualized; pinning must work from the estimated scroll
  geometry without forcing layout per block.
- The mirror rule from paste-and-media still binds the composer; this spec
  touches only sent rendering.
- Whatever loosens the `imageBody` containment check must not loosen it in
  general: the staged directory is this app's own and knowable — an
  allowlist, not a hole.

## Validation

- Scroll-state tests for the pin/release/re-pin machine as pure logic.
- A browser pass: stream a long turn, release mid-stream, jump back, send.
- A live pass where pi reads a pasted screenshot and the thumbnail draws.

## Decisions (settled by the mockup, 2026-08-18)

1. **Follow mode**: follow is on while the view is within ~48px of the
   bottom; new content keeps it pinned. Any upward scroll breaks it
   instantly — the stream never moves the view while the reader reads.
2. **The pill**: appears only when paused *and* new content exists. It reads
   `↓ N new · jump to latest · G` — a count, not just an arrow. Click or `G`
   re-follows; scrolling back to the bottom re-arms follow silently with no
   button needed.
3. **The status line mirrors the state**: a dot plus FOLLOWING (pulsing) or
   PAUSED — always visible, zero surprise.
4. **Inline chips**: chips flow inside the sentence, never a separate row.
   Activating a chip expands a card directly below the message — image, name,
   dimensions, `expanded from chip`, `open ↗`. Expansion is per-chip and the
   card stays until toggled closed.
5. **Read thumbnails**: a `read` of an image carries a real thumbnail nested
   under the row — "what pi saw" — click to zoom. The staged-screenshot fix
   allowlists this app's own staging directory in `imageBody`; the general
   workspace containment stays exactly as strict as it is.
6. **Pin state is per column** — each thread remembers its own follow state.

## Open questions (small, settle in implementation)

- Whether `G` at the true bottom is a no-op or still snaps — record in the
  plan doc.
