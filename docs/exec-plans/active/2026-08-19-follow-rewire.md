# Follow rewire — the recurring send-doesn't-follow bug, ended at the root

Reported 2026-08-19, again: send a message, the transcript does not go to it.
Fifth report of the same family — `083efc5`, `5a9068a`, `e1b0688`,
`78b351b`, `0bfe5c4` each fixed one face of it and another appeared.

## Root cause

`Follow.scrolled()` classified every scroll event by **position plus frame
counters** (`#settling`, `#crossed`, `SETTLING_FRAMES`, bottom slack) to
guess whether the machine or the reader moved the view. The machine moves
the view constantly — the jump's animated curve, the pin's direct writes,
virtualization measuring below-fold blocks mid-scroll, the browser's own
scroll anchoring — and each arrives as a scroll event indistinguishable from
a hand on the wheel. Any change to any mover changed the event pattern and
broke the guess: following switched off mid-flight, the pin stopped pinning,
and the send landed nowhere. The guess was the bug; the five fixes were
tuning it.

## Decision

**A position can never pause the follow — only an act can.**

- `Follow.take()` is the single door out of following, wired to real acts:
  wheel roll up, touch, scrollbar drag (pointer genuinely down), the paging
  chord upward (`pageColumn`), and every `revealBlock` (an attention shift
  the pin must not fight).
- `Follow.scrolled(at)` can only **re-arm**: back at the bottom — by hand or
  by jump — is following again, silently.
- The settling counters are deleted. A machine scroll cannot unfollow, so a
  jump needs no immunity window.
- The pin loops until the bottom holds still: one write makes the column
  measure estimated blocks, `scrollHeight` grows under the write, so the pin
  re-writes each frame until nothing moves (`follow-column.svelte.ts`).

## Changed

- `src/renderer/src/lib/follow.svelte.ts` — the contract above.
- `src/renderer/src/lib/state/follow-column.svelte.ts` — act listeners
  (wheel/touch/drag), drag-gated pause in `scrolled`, pin-until-stable.
- `src/renderer/src/lib/state/paging.ts` — paging up is `take()`.
- `src/renderer/src/lib/state/block-focus.svelte.ts` — a reveal is `take()`.

## Validation

- `follow.svelte.test.ts` rewritten to the new contract — machine positions
  can never unfollow; acts always do; bottom re-arms.
- `jump-latest.test.ts` (receding virtualized end) unchanged and green.
- Full suite green. Live pass owed in the real app: scroll up, send, the
  transcript lands on the message and stays following.

## Addendum, same day: the loop quit before the layout was done

Second report: the working footer below the fold on send; sometimes half the
message cut. The pin loop stopped on the **first** quiet frame, but render
and measurement trail the model — the block lands, then its markdown
renders, then the column measures it — so growth arrived after the loop had
quit, and nothing re-pinned until the next model delta (none, while
`working…` ticks). Fix: the loop never quits while the thread's
`runState === 'running'`, and past that it needs `QUIET_FRAMES` consecutive
still frames before it lets go. An arrival resets the count.

## Watch for

If a new programmatic scroller is added, it needs nothing: it cannot break
following by construction. If a new *reader gesture* is added (a minimap, a
scrubber), it must call `take()` — that is the entire integration rule.
