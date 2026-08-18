# The transcript answers immediately

Status: **NEED GRILLING.** High-level. Not an approved contract.

Amends [2026-08-18-chat-polish.md](2026-08-18-chat-polish.md), which is
approved and shipped. That spec's follow behaviour and this one's footer are
the same surface; nothing in it is rewritten here.

## Problem

Three ways the transcript is slower or less connected than what is happening.

**Sending a message shows nothing.** pi may take a second to say its first
token and much longer to start a tool call, and in that gap the app looks like
it did not receive the message. The reader's own words are on screen and
nothing else is, so the only feedback that the turn started is the absence of
their draft.

**A turn ends without saying what it cost.** A reader who looked away has no
way to tell a turn that took four seconds from one that took four minutes.

**The reasoning row sits apart from the calls it belongs to.** It draws its
own one-row spine, so a turn that thinks, calls three tools, then thinks again
draws three disconnected spine fragments where one run of work happened.

**Follow stops just short of the bottom.** With following on, a few pixels of
the newest line stay below the fold. The pin sets `scrollTop = scrollHeight`,
which is correct only if the layout has settled by the time it runs — and
during a stream it has not.

## Desired outcome

The moment a message is sent, the thread says it is working, and keeps saying
so with a clock the reader can watch. When the turn ends the same line says
what it took. The reasoning rows join the ledger's spine, so one turn reads as
one run of work. And following means the newest pixel, not nearly.

## In scope

- A working footer at the end of pi's turn: live while the turn runs, final
  when it ends.
- Where the footer lives relative to blocks that arrive after it.
- Joining reasoning rows to the ledger spine that precedes or follows them.
- Making the pin land on the true bottom during a stream.

## Out of scope

- Token or cost figures in the footer — the status bar already carries usage.
- A progress estimate. The app does not know how long a turn will take and
  must not imply it does.
- Changing what a turn *is*; the turn-structure spec still owns that.

## Acceptance behavior

- Sending a message puts a working line at the end of the thread within one
  frame, before pi has said anything.
- The line counts up while the turn runs — seconds, then minutes and seconds
  past a minute.
- When the turn ends the line states the elapsed time in the past tense and
  stops. It stays; it is the turn's record.
- A turn that fails or is interrupted says so rather than reading as finished
  work.
- The footer is always the last thing in the turn: content arriving after it
  pushes it down rather than landing under it.
- A reasoning row draws on the same spine as the tool rows around it — one
  continuous line through a turn's work, whatever order thinking and calls
  arrive in.
- With following on and a turn streaming, the last line of content is fully
  visible, not clipped by the fold.

## Constraints

- One clock for the whole app, not a timer per thread: an interval per column
  multiplies with the strip.
- The footer is derived from the turn's own state. It is not a block the
  backend sends, and nothing about it reaches the session log.
- The pin must not read layout per delta — the column is virtualized, and
  measuring per token is the cost that virtualization exists to avoid.

## Validation

- Timer-formatting tests: seconds, the minute boundary, a long turn.
- Follow tests for the settle: pinned after content grows in the same frame.
- A browser pass: send, watch the footer count, watch it settle, confirm the
  bottom line is whole.

## Questions the grill must answer

1. The wording. `working…` while running and `worked for 1m04s` after — or
   something better? Does a failed turn say `stopped after 12s`?
2. Does the footer appear for a turn the reader did not start — a resumed
   thread, a steer?
3. Is the elapsed time wall-clock from send, or from pi's first event?
4. Does the reasoning row keep its own node when it joins the ledger spine, or
   become a row of that ledger outright?
5. What exactly is short of the bottom — is a `scrollTop` after a
   `requestAnimationFrame` enough, or does the last block need to report its
   own height?
