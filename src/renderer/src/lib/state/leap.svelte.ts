/** Leap: the reader types what they can see, and lands on the block it is in.
 *
 *  Three phases, and the key means something different in each — which is why
 *  the mode owns every key while it is up. Nothing is painted until the first
 *  character; labels arrive with the second; the third is a label.
 *
 *  Matches are painted with the CSS Custom Highlight API rather than by
 *  wrapping text in elements. Wrapping would put this module in a fight with
 *  Svelte over the ownership of the same nodes, mid-stream, in a keyed list. */

import { PATTERN_LENGTH, findMatches, labelAt, matchForLabel, wrapGroup } from '../leap'
import { blockElement, blockFocus } from './block-focus.svelte'
import { columnBody } from './columns'

/** The name the stylesheet paints. */
const HIGHLIGHT = 'leap-match'

/** One place the reader can go. */
export interface LeapTarget {
  /** The block this match sits in — the actual destination. */
  navId: string
  /** Where the chip goes, in the column's content coordinates: just past the
   *  match, so the pair the reader typed stays visible under it. */
  top: number
  left: number
}

/** A text node inside the column's viewport, and the block it belongs to. */
interface Candidate {
  node: Text
  navId: string
}

/** Whether the browser can paint ranges without us touching the DOM. Guarded
 *  rather than assumed so a headless test run does not have to fake it. */
function highlights(): { set: (name: string, h: unknown) => void; delete: (name: string) => void } | null {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return null
  return CSS.highlights as unknown as {
    set: (name: string, h: unknown) => void
    delete: (name: string) => void
  }
}

/** Every text node the reader can actually see, and the block it belongs to.
 *
 *  Nothing is skipped by tag: a match inside a tool body's code line is as
 *  good a destination as one in a message. What is skipped is what is not on
 *  screen — a hint is a promise that the destination is in front of you, and
 *  `#search` measures each match again so a node straddling the fold offers
 *  only the half of itself that is visible. */
/** The first child of the scroller that reaches into the viewport.
 *
 *  Found by bisection, not by scanning. Reading a rect on a block that
 *  `content-visibility: auto` had skipped forces it to be laid out — so a scan
 *  from the top lays out every block above the fold and undoes the very
 *  virtualization that makes a long thread scrollable. Children are in
 *  document order and their positions only increase, so about a dozen reads
 *  find the edge instead of five thousand. */
function firstInView(children: HTMLElement[], top: number): number {
  let low = 0
  let high = children.length - 1
  let at = children.length

  while (low <= high) {
    const mid = (low + high) >> 1
    if ((children[mid]?.getBoundingClientRect().bottom ?? 0) > top) {
      at = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return at
}

function candidates(body: HTMLElement): Candidate[] {
  const box = body.getBoundingClientRect()
  const children = Array.from(body.children) as HTMLElement[]
  const found: Candidate[] = []

  for (let i = firstInView(children, box.top); i < children.length; i += 1) {
    const child = children[i]
    if (!child || child.getBoundingClientRect().top >= box.bottom) break

    // A child is either a block itself or a ledger holding several.
    const blocks = child.matches('[data-nav-id]')
      ? [child]
      : Array.from(child.querySelectorAll<HTMLElement>('[data-nav-id]'))

    for (const block of blocks) {
      const navId = block.dataset.navId
      if (!navId) continue

      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node as Text
        if (text.data.trim() === '') continue
        found.push({ node: text, navId })
      }
    }
  }

  return found
}

class Leap {
  /** Which thread is leaping. Null when nothing is. */
  threadId = $state.raw<string | null>(null)
  /** What the reader has typed so far — nothing, one character, or two. */
  typed = $state.raw('')
  /** Which page of labels is showing. */
  group = $state.raw(0)
  /** Every match of the pattern, in document order. Empty before the first
   *  character, and after a pattern that found nothing. */
  targets = $state.raw<LeapTarget[]>([])

  /** The nodes the current search ran over, kept so a second character can
   *  narrow without walking the column again. */
  #pool: Candidate[] = []
  /** Ranges of the current matches, held for painting and for nothing else. */
  #ranges: Range[] = []
  /** Stops watching the column that is being leapt over. */
  #release: (() => void) | null = null

  get active(): boolean {
    return this.threadId !== null
  }

  /** True once labels are showing — the phase where a key is a label. */
  get labelled(): boolean {
    return this.typed.length >= PATTERN_LENGTH
  }

  activeFor(threadId: string): boolean {
    return this.threadId === threadId
  }

  /** The label on a match, or null when it is on another page. */
  labelOf(index: number): string | null {
    if (!this.labelled) return null
    return labelAt(index, this.group)
  }

  /** Begins a leap over what the column is showing.
   *
   *  Refuses a column that has not painted: there is no viewport to promise
   *  anything about, and entering would swallow the next keystroke and then
   *  cancel itself. */
  start(threadId: string): void {
    const body = columnBody(threadId)
    if (!body) return

    this.#pool = candidates(body)
    if (this.#pool.length === 0) return

    this.threadId = threadId
    this.typed = ''
    this.group = 0
    this.targets = []
    this.#ranges = []

    // A leap labels what is on screen. Scrolling changes what is on screen, so
    // every label becomes a promise about a view that no longer exists — the
    // mode ends rather than trying to follow.
    //
    // Re-walking instead was measured and rejected: on a five-thousand-block
    // thread it cost upwards of 100ms a frame however the walk was written,
    // because finding the visible window at all means reading rects that
    // `content-visibility` had deliberately skipped.
    const onScroll = (): void => this.end()
    body.addEventListener('scroll', onScroll, { passive: true })
    this.#release = () => body.removeEventListener('scroll', onScroll)
  }

  /** Adds a character to the pattern and re-paints. Returns the match to jump
   *  to when the pattern resolved to exactly one, and null otherwise. */
  type(key: string): number | null {
    if (!this.active || this.labelled) return null

    const pattern = this.typed + key
    this.typed = pattern
    this.group = 0
    this.#search(pattern)

    // Nothing to aim at. Guessing is worse than doing nothing.
    if (this.targets.length === 0) {
      this.end()
      return null
    }

    // One match needs no name. This is the only autojump: leap.nvim also jumps
    // early with labels still live, which it can afford because it reserves
    // keys nobody presses after a motion. Here `j`, `k`, `a`, `l` and `h` are
    // all live the instant a leap ends, so the mode ends when it jumps.
    if (pattern.length === PATTERN_LENGTH && this.targets.length === 1) return 0

    return null
  }

  /** Removes the last typed character, and ends the mode when there is none. */
  backspace(): void {
    if (!this.active) return

    const pattern = this.typed.slice(0, -1)
    if (pattern === '') {
      this.end()
      return
    }

    this.typed = pattern
    this.group = 0
    this.#search(pattern)
  }

  /** Shows another page of labels. */
  page(delta: number): void {
    if (!this.labelled) return
    this.group = wrapGroup(this.group + delta, this.targets.length)
  }

  /** Which match a label means, or null when the key names nothing here. */
  resolve(key: string): number | null {
    if (!this.labelled) return null
    return matchForLabel(key, this.group, this.targets.length)
  }

  end(): void {
    this.#release?.()
    this.#release = null
    this.threadId = null
    this.typed = ''
    this.group = 0
    this.targets = []
    this.#pool = []
    this.#ranges = []
    highlights()?.delete(HIGHLIGHT)
  }

  #search(pattern: string): void {
    const body = this.threadId === null ? null : columnBody(this.threadId)
    if (!body) {
      this.targets = []
      this.#ranges = []
      return
    }

    const box = body.getBoundingClientRect()
    const originTop = box.top - body.scrollTop
    const originLeft = box.left - body.scrollLeft

    // Where "nearest" is measured from: the block the ring is on, or the top
    // of the view when there is no ring. The closest match earns the shortest
    // reach for the hand.
    const ring = this.threadId === null ? null : blockFocus.idOf(this.threadId)
    const anchor =
      (ring === null || this.threadId === null
        ? null
        : blockElement(this.threadId, ring)?.getBoundingClientRect().top) ?? box.top

    const found: { range: Range; target: LeapTarget; distance: number }[] = []

    for (const candidate of this.#pool) {
      // The pool is built once and reused for the second character. Svelte can
      // replace a text node between keystrokes — a streaming turn, a row
      // expanding — and a detached node is not somewhere the reader can go.
      if (!candidate.node.isConnected) continue

      for (const at of findMatches(candidate.node.data, pattern)) {
        const range = document.createRange()
        range.setStart(candidate.node, at)
        range.setEnd(candidate.node, at + pattern.length)

        const rect = range.getBoundingClientRect()
        // A match can sit in a node that is on screen while itself being
        // scrolled past — a long paragraph straddling the fold.
        if (rect.bottom <= box.top || rect.top >= box.bottom) continue

        found.push({
          range,
          distance: Math.abs(rect.top - anchor),
          target: {
            navId: candidate.navId,
            top: rect.top - originTop,
            // Past the match rather than over it — leap.nvim's placement, and
            // for its reason: a label covering the pair you just typed hides
            // the one thing confirming you typed it right.
            left: rect.right - originLeft,
          },
        })
      }
    }

    // Sorted, not filtered: every match stays a destination, but the ones
    // beside the reader get the first labels and the first page.
    found.sort((a, b) => a.distance - b.distance)

    this.#ranges = found.map((entry) => entry.range)
    this.targets = found.map((entry) => entry.target)
    this.#paint()
  }

  #paint(): void {
    const api = highlights()
    if (!api) return

    if (this.#ranges.length === 0) {
      api.delete(HIGHLIGHT)
      return
    }
    api.set(HIGHLIGHT, new Highlight(...this.#ranges))
  }
}

export const leap = new Leap()
