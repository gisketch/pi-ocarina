# Chat polish: follow the stream, chips in the sentence

Status: **NEED GRILLING.** High-level. Not an approved contract.

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

## Questions the grill must answer

1. Arrow or pill — and does it show a count of what arrived while released?
2. Which key jumps to live, and does `G` (end of thread) also re-pin?
3. Does an expanded inline chip stay expanded in the transcript, and is the
   expansion per-chip or one-at-a-time?
4. Does the staged-image fix allowlist the staging directory in `imageBody`,
   or stage into the workspace, or something else the grill finds?
5. Does release survive a thread switch — is pin state per column?
