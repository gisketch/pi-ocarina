/** Wiring one column to its follow state.
 *
 *  The rules are in `Follow`; this is the part that has to touch a real
 *  element. Held apart from the column's markup because it is a complete idea
 *  — what counts as an arrival, when to pin, and how to pin without measuring
 *  per token — and because the column was over its line budget with it inline.
 */

import { untrack } from 'svelte'

import { atBottom } from '../follow.svelte'
import { registerColumnBody, scrolling } from './columns'
import { following } from './following.svelte'
import { threads } from './threads.svelte'

export interface ColumnFollow {
  /** Feed a scroll event through. The column's `onscroll`. */
  scrolled: () => void
}

export function followColumn(
  threadId: () => string,
  element: () => HTMLElement | null,
): ColumnFollow {
  // The column's scroller, published for everything that has to move it:
  // revealing a focused block, the jump, the leap overlay's coordinates, the
  // block menu's placement, half-page scrolling. This moved here with the rest
  // of the element wiring; left behind in the component it was simply deleted,
  // and every one of those went quietly dead.
  $effect(() => {
    const box = element()
    if (!box) return
    return registerColumnBody(threadId(), box)
  })

  /** Whether a pointer is dragging the scrollbar. The one reader act that
   *  arrives only as scroll events, so it is the one place a position gets to
   *  pause — and only while the button is genuinely down. */
  let dragging = false

  // The acts that pause the follow. Only acts can: every programmatic mover
  // produces scroll events indistinguishable from a reader's, and inferring
  // intent from positions is the guess that made this bug recur. A wheel
  // roll upward, a touch, a drag — each is a hand on the view.
  $effect(() => {
    const box = element()
    if (!box) return
    const id = threadId()

    const wheeled = (event: WheelEvent): void => {
      if (event.deltaY < 0) following.of(id).take()
    }
    const touched = (): void => following.of(id).take()
    const pressed = (): void => {
      dragging = true
    }
    const released = (): void => {
      dragging = false
    }

    box.addEventListener('wheel', wheeled, { passive: true })
    box.addEventListener('touchstart', touched, { passive: true })
    box.addEventListener('mousedown', pressed, { passive: true })
    window.addEventListener('mouseup', released, { passive: true })
    return () => {
      box.removeEventListener('wheel', wheeled)
      box.removeEventListener('touchstart', touched)
      box.removeEventListener('mousedown', pressed)
      window.removeEventListener('mouseup', released)
    }
  })

  // What the stream landed. Read from the model rather than from the DOM:
  // measuring the scroll height to notice growth would force layout on every
  // delta, which is what the column's virtualization exists to avoid.
  //
  // Not the block count. A long answer is *one* block whose text grows in
  // place, and a run of tool calls is *one* ledger whose rows grow in place —
  // so a count never changes mid-turn, and the view froze at the first line of
  // exactly the turns worth following. This changes on every delta.
  const arrivals = $derived.by(() => {
    const model = threads.get(threadId())
    const blocks = model.blocks
    const last = blocks[blocks.length - 1]
    const grown =
      last === undefined
        ? 0
        : last.kind === 'ledger'
          ? last.rows.length
          : 'text' in last
            ? last.text.length
            : 0
    // The turn's footer is drawn under the last block and is not one of them:
    // it appears when a turn starts and changes when it ends. Left out, a
    // reader who sent a message was pinned to the bottom of the *blocks* with
    // `working for …` below the fold, and had to scroll to see that anything
    // was happening at all.
    const turn = model.turn
    const footer = turn === undefined ? '' : `${turn.startedAt}:${turn.endedAt ?? ''}:${turn.outcome ?? ''}`
    return { blocks: blocks.length, grown, footer }
  })

  /** How many blocks this column had last time it looked. Not reactive: it is
   *  the effect's own memory, and making it state would re-run the effect that
   *  writes it. `-1` until the first pass, so opening a thread with a hundred
   *  blocks does not count them as a hundred arrivals. */
  let seen = -1
  /** A pin already scheduled for the next frame, so a stream queues one and
   *  not one per token. */
  let settling = 0

  // Counted in blocks, not in characters: `3 new` means three things arrived,
  // and a pill reading `1,847 new` after one paragraph would be nonsense.
  $effect(() => {
    const now = arrivals.blocks
    if (seen >= 0 && now > seen) following.of(threadId()).arrived(now - seen)
    seen = now
  })

  /** How many consecutive quiet frames end the pin loop once nothing is
   *  running. Rendering and measuring trail the model by a few frames — the
   *  message lands, then its markdown renders, then the column measures it —
   *  and a loop that quit on the first quiet frame left the footer below the
   *  fold with nothing to re-pin until the next delta. */
  const QUIET_FRAMES = 8

  let quiet = 0

  /** One pass of the pin loop: write the bottom, and keep coming back until
   *  it genuinely holds still. Writing once was never enough — the write
   *  itself makes the column measure blocks it had only estimated,
   *  `scrollHeight` grows under the write, and a single correction still
   *  landed short. While a turn is running the loop never quits at all:
   *  the stream renders on its own schedule, and "quiet for a frame" is not
   *  "done" — this is what pins the working footer the moment a send lands. */
  const settle = (): void => {
    settling = 0
    const box = element()
    // Checked live, not when scheduled: a reader who took the view in the
    // intervening frame keeps it — yanking it back is the one thing follow
    // mode promises never to do.
    if (!box || !following.of(threadId()).following) return

    // A jump's animation owns the travel. Its aim re-asks for the bottom
    // every frame, so it arrives wherever the bottom has moved to — writing
    // under it is what turned the send's glide into a cut. The loop stays
    // scheduled as the watchdog for what the landing leaves.
    if (scrolling(box)) {
      quiet = 0
      settling = requestAnimationFrame(settle)
      return
    }

    const wanted = Math.max(0, box.scrollHeight - box.clientHeight)
    if (Math.abs(box.scrollTop - wanted) < 1) {
      quiet += 1
      if (quiet > QUIET_FRAMES && threads.get(threadId()).runState !== 'running') return
    } else {
      quiet = 0
      box.scrollTop = box.scrollHeight
    }
    settling = requestAnimationFrame(settle)
  }

  // Pinned: keep the newest content in view. `scrollTop` rather than a smooth
  // scroll — a stream arriving faster than an animation settles would leave
  // the view permanently chasing itself.
  $effect(() => {
    // Both, so the pin follows a block being added *and* one growing.
    void arrivals.blocks
    void arrivals.grown
    void arrivals.footer

    const box = element()
    // Untracked, and this is the whole of why `G` was instant. Read plainly,
    // the follow flag is a dependency of this effect — and `jump()` sets it
    // true as its first act, so pressing `G` re-ran the pin on the same tick,
    // which stopped the animation the jump had just started and wrote the
    // bottom straight. The pin belongs to arrivals. Turning following on is
    // not an arrival; it is a reader saying where they want to be, and how
    // they get there is the jump's business.
    if (!box || !untrack(() => following.of(threadId()).following)) return
    // A jump still travelling keeps the wheel: its aim is the live bottom,
    // asked again every frame, so the arrival that just landed is already
    // where it is going — smoothly, the same glide `G` has. The pin writes
    // directly only when nothing is in flight, which is what a stream is
    // once the jump has landed.
    if (!scrolling(box)) box.scrollTop = box.scrollHeight

    // And again until the browser has laid everything out and the bottom
    // genuinely holds still.
    quiet = 0
    if (settling === 0) settling = requestAnimationFrame(settle)
  })

  $effect(() => () => {
    if (settling !== 0) cancelAnimationFrame(settling)
  })

  return {
    scrolled: () => {
      const box = element()
      if (!box) return
      const at = {
        top: box.scrollTop,
        height: box.clientHeight,
        total: box.scrollHeight,
      }
      // A scrollbar drag is the one reader act that arrives only as scroll
      // events. Gated on the button being genuinely down — never inferred
      // from the position alone.
      if (dragging && !atBottom(at)) following.of(threadId()).take()
      following.of(threadId()).scrolled(at)
    },
  }
}
