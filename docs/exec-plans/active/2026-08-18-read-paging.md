# Paging, the ring, and the jump to the end — tickets

Spec: [2026-08-18-read-paging.md](../../specs/2026-08-18-read-paging.md) (T1).
T2 and T3 are reported bugs against the jump, carried here because they land in
the same code and would otherwise be fixed against each other.

Status legend: `todo` · `in-progress` · `done`.

## T1 — paging carries the ring in READ — `done`

> The graze the spec covers. Independent of the other two: it decides where the
> ring lands, and never moves the view.

- New `paging.ts` — `scroll()` grew past what `block-nav.svelte.ts` could hold
  (360 lines against a 350 ceiling), and the seam was already there: what a
  *page* does to a column is a different question from what a *key* does to the
  transcript. `pageColumn(threadId, list, delta, ring)` owns the distance, the
  anchor and where the ring lands; `blockNav.scroll` is one line.
- In READ, and only in READ, it picks the block that will be topmost once the
  clamped distance is travelled and calls `blockFocus.set`. Never `move`, which
  reveals — that is what made the old ring paging fight itself.
- The pick reads the layout as it stands, before the scroll: the first block
  whose head sits at or below `viewportTop + distance`. Falls back to the block
  covering that line when a fence is taller than the column.
- At the ends, where the clamped distance is short of a page, the ring goes to
  the last block on `ctrl-d` and the first on `ctrl-u`.
- Acceptance: from the bottom of a long thread, three `ctrl-u` leave the ring
  on a block on screen and the view where the third press put it; `j` then
  moves one block from what is lit without dragging the view back. From NORMAL
  neither chord lights anything.
- Validation: `block-paging.test.ts` asserts the lit id alongside the travel —
  the topmost block, the end when a page will not fit, and nothing lit from
  NORMAL.

## T2 — `G` reaches the true end in one press — `done`

> Reported: from the middle of a thread it takes two or three presses. Fix
> before T3 — tuning how a scroll *reads* against a target that is still moving
> would be tuning against noise.

- **The app-level reproduction was not achieved, and the bar set here was not
  met.** A 90-turn mock thread was added and does reach the column: 270 blocks.
  But `pnpm dev:web` runs in a pane that never paints — `requestAnimationFrame`
  yields no frames, so `content-visibility` measures nothing and only 19 of the
  270 blocks have any height at all. The drift cannot be observed there, by
  this or any other means available here. The fix is verified against a model
  of the mechanism rather than against the app; the report stands as the
  evidence that the app exhibits it.
- `long.ts` — the 90-turn thread, kept because it is what a real reproduction
  needs and the next person should not have to build it.
- Then `columns.ts` — the jump's three settle passes are a fixed budget spent
  in three frames. A bottom that is still moving needs the aim to continue
  until it holds still for two consecutive frames, under a ceiling so a stream
  cannot hold the scroll open forever.
- Acceptance: one `G` from the middle of a long thread ends with
  `scrollTop + clientHeight === scrollHeight`, and a second `G` moves nothing.
- Validation: `jump-latest.test.ts` — the frame driver runs frames whether or
  not the scroll still wants them, because the browser goes on measuring after
  our animation gives up, and a driver that stopped with it hid exactly that.
  With the thread growing 200px a frame for twenty frames, the old code lands
  at 6400 against an end of 8000 — 1600px short, which is the second and third
  press. **The browser measurement is not part of this: it could not be
  taken.**

## T3 — `G` reads as a scroll rather than a cut — `done`

> Blocked by: T2.

- Reported for both modes. The jump is already animated, on the same 130ms as
  `j` — which is right for a few hundred pixels and, over the several thousand
  a jump crosses, is a cut with no motion in it.
- `columns.ts` — the duration scales with the distance: 130ms as the floor,
  rising to a ceiling near 320ms, so a long travel has frames to read. The
  safety-net timer scales with it rather than staying at four times the floor.
- Acceptance: `G` from the top of a long thread is visibly a travel, not a
  teleport; `j` and `k` over one block are unchanged.
- Validation: `jump-latest.test.ts` counts the frames a jump uses — 9 before
  (about 144ms, a cut), 20 after (320ms, the ceiling). The short case stays
  pinned by the existing scroll tests. How it *looks* is still an eye test, and
  in the real app rather than `dev:web`, which does not paint.

## T4 — `G` was instant because the pin took the animation — `done`

> Found while answering the report that T3 had not fixed it. Not a tuning
> problem: the jump had never animated.

- `follow-column.svelte.ts` — the pin reads `following.of(…).following` inside
  its effect, which makes the flag a dependency. `jump()` sets that flag true as
  its first act, so pressing `G` re-ran the pin on the same tick: `stopScroll`
  and a straight write to the bottom, killing the curve the jump had just
  started. Read untracked now. The pin belongs to arrivals; a reader saying
  where they want to be is not an arrival.
- **Not covered by a test.** An `$effect.root` harness was written and deleted:
  no effect ran under it — `registerColumnBody` never registered — so the
  regression test passed while proving nothing. No `$effect` behaviour in this
  codebase is covered by tests today. Worth its own ticket; not worth a test
  that lies.
