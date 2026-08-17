/** Which name a child borrows, and when it gives it back.
 *
 *  A name lives for one spawn. It is drawn from the names not currently in use,
 *  written into the record, and released when the child settles — so no two
 *  children alive at the same moment ever share one, and a name that comes back
 *  next week is a different child rather than a memory nobody has. */

/** What a child is called when the pool has run dry.
 *
 *  Numbered rather than random: two anonymous children would otherwise be
 *  indistinguishable in the rows, which is the one thing a name exists to
 *  prevent. The pool ships far larger than the concurrency cap, so this is the
 *  behaviour for a pool somebody emptied. */
const SPARE = 'agent'

export class NamePool {
  readonly #taken = new Set<string>()
  #spares = 0

  /** Borrows a name. The caller must release it. */
  draw(pool: readonly string[]): string {
    const free = pool.filter((name) => !this.#taken.has(name))
    if (free.length > 0) {
      // Not random: the same fan-out gives the same names in the same order,
      // which makes a screenshot or a test reproducible.
      const name = free[0]
      this.#taken.add(name)
      return name
    }

    this.#spares += 1
    const name = `${SPARE}-${this.#spares}`
    this.#taken.add(name)
    return name
  }

  release(name: string): void {
    this.#taken.delete(name)
  }

  get live(): number {
    return this.#taken.size
  }
}
