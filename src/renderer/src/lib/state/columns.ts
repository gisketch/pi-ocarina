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

/** Registers a scrollable element, which is how thread columns scroll. */
export function registerColumnBody(id: string, el: HTMLElement): () => void {
  return registerColumnScroller(id, (top) => el.scrollBy({ top, behavior: 'smooth' }))
}

export function scrollColumn(id: string, top: number): void {
  scrollers.get(id)?.(top)
}
