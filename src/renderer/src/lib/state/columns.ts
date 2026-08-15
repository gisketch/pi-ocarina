/** Registry of scrollable thread-column bodies, keyed by thread id.
 *  Lets the keyboard layer scroll the focused column without prop-drilling refs. */
const bodies = new Map<string, HTMLElement>()

export function registerColumnBody(id: string, el: HTMLElement): () => void {
  bodies.set(id, el)
  return () => {
    if (bodies.get(id) === el) bodies.delete(id)
  }
}

export function scrollColumn(id: string, top: number): void {
  bodies.get(id)?.scrollBy({ top, behavior: 'smooth' })
}
