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

/** How long a programmatic scroll takes, at its shortest.
 *
 *  The browser's own `behavior: 'smooth'` runs about 400ms and eases at both
 *  ends, which reads as sluggish under a keyboard: the key is instant, so the
 *  motion is only there to show which way the page went. Short, and easing out
 *  only, keeps the move readable without making the reader wait through it. */
const SCROLL_MS = 130

/** And at its longest. A jump to the end of a thread crosses thousands of
 *  pixels, and 130ms of that is not a scroll a reader can follow — it is a cut,
 *  with the transcript in a different place on the other side of it. The
 *  duration rises with the distance so that a long travel has frames enough to
 *  read as travel, and stops rising before it becomes a wait. */
const SCROLL_MS_MAX = 320

/** How much distance buys a millisecond. A page of about 500px comes out near
 *  the floor; a jump reaches the ceiling and stays there. */
const MS_PER_PX = 1 / 12

/** How many frames a landed scroll may spend chasing a target that is still
 *  moving.
 *
 *  A column virtualizes its blocks, so the height of everything below the fold
 *  is an estimate until it is measured. Scrolling is what causes that
 *  measurement, and each newly measured block moves the end of the thread
 *  further away — which is why a jump to the end used to arrive short, and take
 *  two or three presses to converge. The scroll keeps closing the gap until the
 *  target holds still. The cap is only a stop against a thread that grows
 *  forever, which a live turn can do. */
const SETTLE_FRAMES = 40

/** Scrolls in flight, by the element they are moving. `to` is where the scroll
 *  is going, which is what a second keypress must add to — adding to the live
 *  `scrollTop` mid-flight would move less than a press is worth. */
const inflight = new Map<HTMLElement, { frame: number; timer: ReturnType<typeof setTimeout>; to: number }>()

/** Where `el` will be when everything asked for has happened. */
export function scrollRest(el: HTMLElement): number {
  return inflight.get(el)?.to ?? el.scrollTop
}

/** Whether a programmatic scroll is travelling on `el` right now. The follow
 *  pin yields to one: a jump's curve re-aims at the live bottom every frame,
 *  so the animation *is* the way there, and a direct write racing it is what
 *  made a send arrive as a cut instead of the `G` glide. */
export function scrolling(el: HTMLElement): boolean {
  return inflight.has(el)
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

  const span = Math.min(SCROLL_MS_MAX, SCROLL_MS + Math.abs(first - el.scrollTop) * MS_PER_PX)
  const start = performance.now()
  let previous = start
  let settles = 0

  // One record, mutated in place and put in the map before the first frame is
  // asked for. A frame that finds a different record has been superseded — and
  // registering after scheduling would lose every frame under a synchronous
  // `requestAnimationFrame`, which is how the tests drive this.
  const running = { frame: 0, timer: 0 as unknown as ReturnType<typeof setTimeout>, to: first }

  const land = (to: number): void => {
    el.scrollTop = to
    stopScroll(el)
  }

  // Re-armed by every frame, so it measures a drought rather than the whole
  // move: `requestAnimationFrame` suspends in an occluded or busy window, and a
  // jump to the latest is the one scroll that must never be lost. A scroll that
  // is legitimately still travelling keeps pushing it back.
  const watch = (): void => {
    clearTimeout(running.timer)
    running.timer = setTimeout(() => {
      if (inflight.get(el) !== running) return
      land(clampTop(el, aim()))
    }, SCROLL_MS_MAX)
  }

  const step = (now: number): void => {
    if (inflight.get(el) !== running) return

    const to = clampTop(el, aim())
    // Whether the target itself moved since the last frame, which is a block
    // being measured for the first time. Distinct from the gap: a scroll can
    // be a pixel from a target that is still running away from it.
    const holding = Math.abs(to - running.to) < 1
    running.to = to
    watch()

    const gap = to - el.scrollTop
    if (holding && Math.abs(gap) < 1) {
      land(to)
      return
    }

    const before = Math.min(1, (previous - start) / span)
    const after = Math.min(1, (now - start) / span)
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
    if (settles >= SETTLE_FRAMES) {
      land(to)
      return
    }
    settles += 1
    el.scrollTop += gap / 2
    running.frame = requestAnimationFrame(step)
  }

  inflight.set(el, running)
  watch()
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
