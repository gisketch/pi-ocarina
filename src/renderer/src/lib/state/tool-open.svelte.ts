/** Which tool rows are expanded, per thread.
 *
 *  Lifted out of the ledger component because two things open a row now: a
 *  click on it, and `l` on the focused block. One of them lives in the
 *  keyboard layer, which has no component to reach into.
 *
 *  Only what a person changed is stored. Each row carries its own default, and
 *  rows that arrive later still open with the default they were given, so a
 *  streaming ledger must not be flattened into one remembered map. */

class ToolOpen {
  #overrides = $state<Record<string, Record<string, boolean>>>({})

  /** Whether a row is open, given the default it was born with. */
  isOpen(threadId: string, rowId: string, fallback: boolean): boolean {
    return this.#overrides[threadId]?.[rowId] ?? fallback
  }

  set(threadId: string, rowId: string, open: boolean): void {
    const forThread = this.#overrides[threadId] ?? {}
    if (forThread[rowId] === open) return

    this.#overrides = { ...this.#overrides, [threadId]: { ...forThread, [rowId]: open } }
  }

  toggle(threadId: string, rowId: string, fallback: boolean): void {
    this.set(threadId, rowId, !this.isOpen(threadId, rowId, fallback))
  }

  /** Called when a thread's column goes away. */
  forget(threadId: string): void {
    if (this.#overrides[threadId] === undefined) return

    const next = { ...this.#overrides }
    delete next[threadId]
    this.#overrides = next
  }
}

export const toolOpen = new ToolOpen()
