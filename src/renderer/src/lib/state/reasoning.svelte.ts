/** Which reasoning blocks are open.
 *
 *  Two settings in one: a global default that `o` flips, and the blocks a
 *  reader opened or closed by hand. The per-block choice wins, because it is
 *  the more recent and the more specific thing they said.
 *
 *  Per thread, like every other reading state: opening one thread's reasoning
 *  is not a statement about another's. The global default is not per thread —
 *  it is a preference about how the reader likes to read. */

class ReasoningOpen {
  /** What a block does when nobody has said otherwise. */
  byDefault = $state(false)
  #chosen = $state<Record<string, Record<string, boolean>>>({})

  isOpen(threadId: string, id: string): boolean {
    return this.#chosen[threadId]?.[id] ?? this.byDefault
  }

  toggle(threadId: string, id: string): void {
    const forThread = this.#chosen[threadId] ?? {}
    const next = !this.isOpen(threadId, id)
    this.#chosen = { ...this.#chosen, [threadId]: { ...forThread, [id]: next } }
  }

  /** `o`. Flips the default and drops the per-block choices with it — one key
   *  that means "show me all of this" has to actually show all of it, or the
   *  blocks the reader closed earlier stay shut and the key looks broken. */
  toggleAll(): void {
    this.byDefault = !this.byDefault
    this.#chosen = {}
  }

  forget(threadId: string): void {
    if (this.#chosen[threadId] === undefined) return
    const next = { ...this.#chosen }
    delete next[threadId]
    this.#chosen = next
  }
}

export const reasoningOpen = new ReasoningOpen()
