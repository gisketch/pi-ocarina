/** What has been typed into a column and not yet sent.
 *
 *  Held here rather than in the composer because the composer now lives inside
 *  the column it belongs to, and is created and destroyed as focus moves along
 *  the strip. A draft kept in the component would go with it: type half a
 *  message, glance at the column next door, and come back to an empty field.
 *
 *  Keyed by column id, not thread id. The placeholder column is exactly where a
 *  first message gets typed, and it has no thread until that message is sent. */
class Drafts {
  #per = $state<Record<string, string>>({})

  get(columnId: string): string {
    return this.#per[columnId] ?? ''
  }

  set(columnId: string, text: string): void {
    if (this.#per[columnId] === text) return
    this.#per = { ...this.#per, [columnId]: text }
  }

  /** Called when a column goes away, the way the other per-column registries
   *  are. A closed column's draft has nowhere to be sent. */
  forget(columnId: string): void {
    if (this.#per[columnId] === undefined) return

    const next = { ...this.#per }
    delete next[columnId]
    this.#per = next
  }
}

export const drafts = new Drafts()
