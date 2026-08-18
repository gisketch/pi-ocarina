/** Whether reasoning is shown at all, and which blocks are expanded.
 *
 *  Two different questions. `o` answers the first: it hides every reasoning
 *  row in the app, for a reader who does not want to see the model think.
 *  Clicking a row answers the second, for the rows that are shown.
 *
 *  Expansion is per thread, like every other reading state. Visibility is not
 *  — it is a preference about how the reader likes to read, and having it
 *  differ per thread would mean answering it again in every column. */

class ReasoningOpen {
  /** Whether reasoning rows are drawn at all. `o` flips this. */
  shown = $state(true)
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

  /** `o`. Shows or hides every reasoning row in the app.
   *
   *  Hiding rather than collapsing: a reader who does not care what the model
   *  thought does not want a row per thought either, and a key that only
   *  collapsed them would leave the transcript exactly as cluttered. */
  toggleAll(): void {
    this.shown = !this.shown
  }

  forget(threadId: string): void {
    if (this.#chosen[threadId] === undefined) return
    const next = { ...this.#chosen }
    delete next[threadId]
    this.#chosen = next
  }
}

export const reasoningOpen = new ReasoningOpen()
