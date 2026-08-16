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

/** Scrolls in flight, by the element they are moving. `to` is where the scroll
 *  is going, which is what a second keypress must add to — adding to the live
 *  `scrollTop` mid-flight would move less than a press is worth. */
const inflight = new Map<HTMLElement, { frame: number; to: number }>()

/** Where `el` will be when everything asked for has happened. */
export function scrollRest(el: HTMLElement): number {
  return inflight.get(el)?.to ?? el.scrollTop
}

export function stopScroll(el: HTMLElement): void {
  const running = inflight.get(el)
  if (!running) return
  cancelAnimationFrame(running.frame)
  inflight.delete(el)
}

/** Moves `el` to `top` on our own curve rather than the browser's. */
export function smoothScrollTo(el: HTMLElement, top: number): void {
  stopScroll(el)

  const from = el.scrollTop
  const to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, top))
  if (Math.abs(to - from) < 1) {
    el.scrollTop = to
    return
  }

  const start = performance.now()
  const step = (now: number): void => {
    const through = Math.min(1, (now - start) / SCROLL_MS)
    // Ease out only: the move starts at full speed, so the first frame already
    // shows the direction, and settles rather than stopping dead.
    el.scrollTop = from + (to - from) * (1 - (1 - through) ** 3)
    if (through >= 1) {
      inflight.delete(el)
      return
    }
    inflight.set(el, { frame: requestAnimationFrame(step), to })
  }

  inflight.set(el, { frame: requestAnimationFrame(step), to })
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
