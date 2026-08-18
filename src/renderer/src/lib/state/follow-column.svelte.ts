/** Wiring one column to its follow state.
 *
 *  The rules are in `Follow`; this is the part that has to touch a real
 *  element. Held apart from the column's markup because it is a complete idea
 *  — what counts as an arrival, when to pin, and how to pin without measuring
 *  per token — and because the column was over its line budget with it inline.
 */

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
  // What the stream landed. Read from the model rather than from the DOM:
  // measuring the scroll height to notice growth would force layout on every
  // delta, which is what the column's virtualization exists to avoid.
  //
  // Not the block count. A long answer is *one* block whose text grows in
  // place, and a run of tool calls is *one* ledger whose rows grow in place —
  // so a count never changes mid-turn, and the view froze at the first line of
  // exactly the turns worth following. This changes on every delta.
  const arrivals = $derived.by(() => {
    const blocks = threads.get(threadId()).blocks
    const last = blocks[blocks.length - 1]
    const grown =
      last === undefined
        ? 0
        : last.kind === 'ledger'
          ? last.rows.length
          : 'text' in last
            ? last.text.length
            : 0
    return { blocks: blocks.length, grown }
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

  // Pinned: keep the newest content in view. `scrollTop` rather than a smooth
  // scroll — a stream arriving faster than an animation settles would leave
  // the view permanently chasing itself.
  $effect(() => {
    // Both, so the pin follows a block being added *and* one growing.
    void arrivals.blocks
    void arrivals.grown

    const box = element()
    if (!box || !following.of(threadId()).following) return
    box.scrollTop = box.scrollHeight

    // And again after the browser has laid the new text out. The line above
    // reads a `scrollHeight` that does not yet include the token that caused
    // it, so following always stopped a line or two short of the bottom — the
    // faster the stream, the further short.
    if (settling !== 0) return
    settling = requestAnimationFrame(() => {
      settling = 0
      // Checked now rather than when this was scheduled: a reader who scrolled
      // up in the intervening frame has taken the view, and yanking it back
      // would be the one thing follow mode promises not to do.
      const now = element()
      if (now && following.of(threadId()).following) now.scrollTop = now.scrollHeight
    })
  })

  $effect(() => () => {
    if (settling !== 0) cancelAnimationFrame(settling)
  })

  return {
    scrolled: () => {
      const box = element()
      if (!box) return
      following.of(threadId()).scrolled({
        top: box.scrollTop,
        height: box.clientHeight,
        total: box.scrollHeight,
      })
    },
  }
}
