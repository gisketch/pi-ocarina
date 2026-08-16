/** Whether the app can reach the model provider right now.
 *
 *  pi retries transient provider failures itself, so this reports the retry
 *  already happening rather than driving one. That is also why there is no
 *  "retry now": pi owns the timer, and a button that could not shorten it
 *  would be a lie in the one place the user is least able to check.
 *
 *  Retries are per thread, but a provider that is failing is failing for all
 *  of them, so the banner is app-level: it is up while any thread is retrying,
 *  and down once the last one recovers. */
class Connectivity {
  /** Threads currently retrying, and how long each says it will wait. */
  #retrying = new Map<string, number | undefined>()

  degraded = $state.raw(false)
  /** The longest wait any retrying thread reported, in seconds. */
  retryInSeconds = $state.raw<number | undefined>(undefined)

  report(threadId: string, state: 'degraded' | 'restored', retryInSeconds?: number): void {
    if (state === 'degraded') this.#retrying.set(threadId, retryInSeconds)
    else this.#retrying.delete(threadId)

    this.degraded = this.#retrying.size > 0
    const waits = [...this.#retrying.values()].filter((wait): wait is number => wait !== undefined)
    this.retryInSeconds = waits.length > 0 ? Math.max(...waits) : undefined
  }

  reset(): void {
    this.#retrying.clear()
    this.degraded = false
    this.retryInSeconds = undefined
  }
}

export const connectivity = new Connectivity()
