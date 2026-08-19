/** How the focused column scrolls, keyed by column id.
 *
 *  A function rather than an element: a thread column scrolls a real scroller,
 *  and a terminal column scrolls a buffer xterm owns and does not expose as
 *  DOM overflow. The keyboard layer should not have to know which it is. */
const scrollers = new Map<string, (top: number) => void>()

/** Registers a column's own way of scrolling. Returns an unregister function. */
export function registerColumnScroller(id: string, scroll: (top: number) => void): () => void {
  scrollers.set(id, scroll)
  return () => {
    if (scrollers.get(id) === scroll) scrollers.delete(id)
  }
}

/** The elements thread columns scroll. A terminal has no entry here: its
 *  buffer belongs to xterm and is not DOM overflow. */
const bodies = new Map<string, HTMLElement>()

/** How long a programmatic scroll takes.
 *
 *  The browser's own `behavior: 'smooth'` runs about 400ms and eases at both
 *  ends, which reads as sluggish under a keyboard: the key is instant, so the
 *  motion is only there to show which way the page went. Short, and easing out
 *  only, keeps the move readable without making the reader wait through it. */
const SCROLL_MS = 130

/** How many extra frames a landed scroll is allowed to correct itself.
 *
 *  A column virtualizes its blocks, so the height of everything below the fold
 *  is an estimate until it is measured. Scrolling is what causes that
 *  measurement, which moves the very thing the scroll was aiming at — under a
 *  fence or a table, by thousands of pixels. Re-aiming each frame handles the
 *  travel; these passes handle a block that settles a frame or two late. */
const SETTLE_PASSES = 3

/** Scrolls in flight, by the element they are moving. `to` is where the scroll
 *  is going, which is what a second keypress must add to — adding to the live
 *  `scrollTop` mid-flight would move less than a press is worth. */
const inflight = new Map<HTMLElement, { frame: number; timer: ReturnType<typeof setTimeout>; to: number }>()

/** Where `el` will be when everything asked for has happened. */
export function scrollRest(el: HTMLElement): number {
  return inflight.get(el)?.to ?? el.scrollTop
}

export function stopScroll(el: HTMLElement): void {
  const running = inflight.get(el)
  if (!running) return
  cancelAnimationFrame(running.frame)
  clearTimeout(running.timer)
  inflight.delete(el)
}

function clampTop(el: HTMLElement, top: number): number {
  return Math.max(0, Math.min(el.scrollHeight - el.clientHeight, top))
}

/** Moves `el` to `top` on our own curve rather than the browser's. */
export function smoothScrollTo(el: HTMLElement, top: number): void {
  smoothScrollAiming(el, () => top)
}

/** The same curve, at a target that is asked for again every frame.
 *
 *  A fixed target is a promise about a layout that has not happened yet. The
 *  transcript measures a block the moment it scrolls into view, and everything
 *  below it moves — so a scroll aimed at a paragraph under a long fence landed
 *  a screen or more away from it, which is what made `j` and `k` read as
 *  erratic. Asking again each frame lets the move follow what it is chasing.
 *
 *  What each frame writes is a fraction of the distance *still to go*, never a
 *  position measured from where the scroll began. Those are the same thing
 *  only while the target holds still. Interpolating from a fixed origin, every
 *  correction to the target moved the view by that correction times however
 *  far along the curve it was — a lurch out and a glide back, once per frame,
 *  which is the rubber band. Closing the remaining gap absorbs a target that
 *  moves, and absorbs the browser's own scroll anchoring shifting `scrollTop`
 *  under us, because both change the gap and neither changes the fraction.
 *
 *  The timer is the safety net. The curve runs on `requestAnimationFrame`, and
 *  an occluded or busy window suspends that — a jump to the latest is the one
 *  scroll that must never be lost, so if no frame has landed it by four
 *  durations, it is written straight. */
export function smoothScrollAiming(el: HTMLElement, aim: () => number): void {
  stopScroll(el)

  const first = clampTop(el, aim())
  if (Math.abs(first - el.scrollTop) < 1) {
    el.scrollTop = first
    return
  }

  const start = performance.now()
  let previous = start
  let settles = 0

  // One record, mutated in place and put in the map before the first frame is
  // asked for. A frame that finds a different record has been superseded — and
  // registering after scheduling would lose every frame under a synchronous
  // `requestAnimationFrame`, which is how the tests drive this.
  const running = {
    frame: 0,
    timer: setTimeout(() => {
      if (inflight.get(el) !== running) return
      stopScroll(el)
      el.scrollTop = clampTop(el, aim())
    }, SCROLL_MS * 4),
    to: first,
  }

  const land = (to: number): void => {
    el.scrollTop = to
    stopScroll(el)
  }

  const step = (now: number): void => {
    if (inflight.get(el) !== running) return

    const to = clampTop(el, aim())
    running.to = to

    const gap = to - el.scrollTop
    if (Math.abs(gap) < 1) {
      land(to)
      return
    }

    const before = Math.min(1, (previous - start) / SCROLL_MS)
    const after = Math.min(1, (now - start) / SCROLL_MS)
    previous = now

    if (after < 1) {
      // Ease out only: the move starts at full speed, so the first frame
      // already shows the direction, and settles rather than stopping dead.
      // Written as the share of what is left, so that the share is all this
      // frame decides and the target is free to have moved.
      const left = (1 - before) ** 3
      el.scrollTop += gap * (left === 0 ? 1 : 1 - (1 - after) ** 3 / left)
      running.frame = requestAnimationFrame(step)
      return
    }

    // Past the curve and still short: the target moved late, which is a block
    // measured after the scroll had all but arrived. Closed by halves rather
    // than written, so a correction reads as the tail of the same move.
    if (settles >= SETTLE_PASSES) {
      land(to)
      return
    }
    settles += 1
    el.scrollTop += gap / 2
    running.frame = requestAnimationFrame(step)
  }

  inflight.set(el, running)
  running.frame = requestAnimationFrame(step)
}

/** Registers a scrollable element, which is how thread columns scroll. */
export function registerColumnBody(id: string, el: HTMLElement): () => void {
  bodies.set(id, el)
  const unscroll = registerColumnScroller(id, (top) => smoothScrollTo(el, scrollRest(el) + top))

  // A hand on the wheel wins. The browser's own smooth scroll yields to user
  // input; ours has to be told to, or a trackpad flick during the 130ms would
  // be dragged back to where the keyboard was going.
  const yield_ = (): void => stopScroll(el)
  el.addEventListener('wheel', yield_, { passive: true })
  el.addEventListener('touchstart', yield_, { passive: true })

  return () => {
    unscroll()
    stopScroll(el)
    el.removeEventListener('wheel', yield_)
    el.removeEventListener('touchstart', yield_)
    if (bodies.get(id) === el) bodies.delete(id)
  }
}

/** The column's scroll box, for readers that need its height rather than a
 *  way to move it. Absent for a terminal column, and for one that has not
 *  painted yet. */
export function columnBody(id: string): HTMLElement | undefined {
  return bodies.get(id)
}

export function scrollColumn(id: string, top: number): void {
  scrollers.get(id)?.(top)
}
