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

export class Follow {
  /** The transcript is pinned to the bottom. The default: a thread opens at
   *  its newest content, which is what the reader came for. */
  following = $state(true)
  /** How much landed while they were reading history. Only ever non-zero
   *  while paused — following means they saw it. */
  unseen = $state(0)

  /** A jump is under way, and the positions it passes through are not the
   *  reader's. A smooth scroll to the bottom crosses every position between
   *  here and there; without this the first frame of a jump reads as a scroll
   *  up and pauses the follow the jump was asking for. */
  #settling = false

  /** The reader moved the view. */
  scrolled(at: ScrollPosition): void {
    if (this.#settling && !atBottom(at)) return
    this.#settling = false

    if (atBottom(at)) {
      // Back at the bottom under their own power: re-arm silently. Making them
      // press a button they have already walked to would be a second step for
      // a thing they have finished doing.
      this.following = true
      this.unseen = 0
      return
    }
    this.following = false
  }

  /** New content landed. Counted only when the reader is not watching it. */
  arrived(count = 1): void {
    if (this.following) return
    this.unseen += count
  }

  /** They asked to come back — the pill, or the key. */
  jump(): void {
    this.following = true
    this.unseen = 0
    this.#settling = true
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
