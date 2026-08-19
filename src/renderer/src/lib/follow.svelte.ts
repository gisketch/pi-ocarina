/** Whether the transcript follows the stream, and what it takes to get back.
 *
 *  The one rule this exists to keep: **the stream never moves the view while
 *  the reader is reading.** Following is a state the reader can leave with one
 *  wheel-click and return to in two ways — by scrolling back down, or by
 *  asking. Everything else here is in service of that.
 *
 *  Pure on purpose. Scroll behaviour is the kind of thing that is impossible
 *  to reason about once it is tangled with a component's lifecycle, and every
 *  rule below is a sentence a test can check. */

/** How close to the bottom still counts as *at* the bottom.
 *
 *  Not zero: a fractional scroll height, a sub-pixel device ratio, or a
 *  half-drawn last block would each put the view a pixel or two short and
 *  break the pin for no reason a reader could see. */
export const BOTTOM_SLACK = 48

export interface ScrollPosition {
  /** How far down the reader has scrolled. */
  top: number
  /** The height of the window they are looking through. */
  height: number
  /** The height of everything there is to look at. */
  total: number
}

export function atBottom(at: ScrollPosition): boolean {
  return at.top + at.height >= at.total - BOTTOM_SLACK
}

/** The rule that ended the recurring follow bug: **a position can never pause
 *  the follow — only an act can.** The machine moves the view all the time —
 *  a jump's curve, the pin, virtualization measuring blocks, the browser's
 *  own scroll anchoring — and every one of those arrives as a scroll event
 *  indistinguishable from a reader. The old model guessed which was which
 *  from positions and frame counters, and every change to any mover broke
 *  the guess; the fix for one interaction was the regression in the next.
 *  Now `take()` is the only way out of following, and it is wired to real
 *  acts: the wheel, a drag, a touch, a paging key, a reveal. A position
 *  report can only re-arm. */
export class Follow {
  /** The transcript is pinned to the bottom. The default: a thread opens at
   *  its newest content, which is what the reader came for. */
  following = $state(true)
  /** How much landed while they were reading history. Only ever non-zero
   *  while paused — following means they saw it. */
  unseen = $state(0)

  /** The reader — or an attention shift on their behalf, like a reveal —
   *  took the view. The one door out of following. */
  take(): void {
    this.following = false
  }

  /** Where the view is now. Positions only ever re-arm: back at the bottom —
   *  under their own power or a jump's — means following again, silently.
   *  Making them press a button they have already walked to would be a
   *  second step for a thing they have finished doing. */
  scrolled(at: ScrollPosition): void {
    if (!atBottom(at)) return
    this.following = true
    this.unseen = 0
  }

  /** New content landed. Counted only when the reader is not watching it. */
  arrived(count = 1): void {
    if (this.following) return
    this.unseen += count
  }

  /** They asked to come back — the pill, the key, or sending a message. */
  jump(): void {
    this.following = true
    this.unseen = 0
  }

  /** Whether the affordance is drawn.
   *
   *  Both halves matter. Paused with nothing new is a reader reading quietly,
   *  and a button offering to take them somewhere they can already see is
   *  noise. */
  get showJump(): boolean {
    return !this.following && this.unseen > 0
  }
}
