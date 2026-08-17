/** The cap on how many children run at once.
 *
 *  Held apart from the fleet because it is a plain semaphore with one twist,
 *  and the twist is the part worth reading: a child that is itself waiting on
 *  children it started is *blocked*, not working, so it lends its slot back.
 *  Without that, a full cap of spawning children waits forever for slots none
 *  of them will release.
 *
 *  The count is across the whole app, not per parent: a per-parent cap
 *  multiplies with depth, which is exactly what a two-level tree was chosen not
 *  to do. */
export class SlotPool {
  readonly #size: number
  /** Callers waiting for a slot, oldest first. */
  readonly #waiting: (() => void)[] = []
  #running = 0

  constructor(size: number) {
    this.#size = size
  }

  /** Waits for a slot. */
  take(): Promise<void> {
    if (this.#running < this.#size) {
      this.#running += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => this.#waiting.push(resolve))
  }

  /** Hands the slot to whoever has been waiting longest. */
  give(): void {
    const next = this.#waiting.shift()
    if (next) next()
    else this.#running -= 1
  }

  /** Runs `work` without holding a slot, and takes one back afterwards. */
  async lend<T>(work: () => Promise<T>): Promise<T> {
    this.give()
    try {
      return await work()
    } finally {
      await this.take()
    }
  }
}
