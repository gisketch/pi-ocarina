/** One clock, for every running child in the app.
 *
 *  A duration that ticks is the only part of an agent row that changes on its
 *  own, and there may be several rows in several columns. One interval serves
 *  all of them: an interval per row would multiply with the fan-out, and a
 *  timer that runs when nothing is running is a wakeup for no reason.
 *
 *  It exists only while something is running, and stops while the window is
 *  hidden. What reads `now` is the leaf that draws the duration, so a second
 *  passing repaints a text node rather than a transcript. */

const TICK_MS = 1000

/** Where "is anybody looking?" comes from.
 *
 *  Injected rather than reaching for `document` directly, because the rule that
 *  a hidden window stops the clock is the part most worth testing and the part
 *  hardest to observe: a preview pane reports itself hidden, so watching the
 *  real thing tick proves nothing either way. */
export interface Visibility {
  hidden: () => boolean
  onChange: (listener: () => void) => void
}

const REAL: Visibility = {
  hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  onChange: (listener) => {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', listener)
  },
}

export class AgentClock {
  /** The current second, as milliseconds. Read by the row that draws a
   *  duration, and by nothing else. */
  now = $state(Date.now())

  #timer: ReturnType<typeof setInterval> | undefined
  /** How many rows are asking. The clock runs while this is above zero. */
  #watchers = 0
  #listening = false

  readonly #visibility: Visibility

  constructor(visibility: Visibility = REAL) {
    this.#visibility = visibility
  }

  /** A row starts watching. Returns the release. */
  watch(): () => void {
    this.#watchers += 1
    this.#start()

    let released = false
    return () => {
      if (released) return
      released = true
      this.#watchers -= 1
      if (this.#watchers <= 0) this.#stop()
    }
  }

  /** Whether a timer is running. For tests, and for anyone wondering whether an
   *  idle app is idle. */
  get ticking(): boolean {
    return this.#timer !== undefined
  }

  #start(): void {
    this.#listen()
    if (this.#timer !== undefined) return
    if (this.#watchers <= 0) return
    if (this.#visibility.hidden()) return

    this.now = Date.now()
    this.#timer = setInterval(() => {
      this.now = Date.now()
    }, TICK_MS)
  }

  #stop(): void {
    if (this.#timer === undefined) return
    clearInterval(this.#timer)
    this.#timer = undefined
  }

  /** Nobody is looking at a hidden window, and a clock that ticks behind one is
   *  a wakeup a laptop pays for. The first tick after it comes back is exact,
   *  because `#start` sets `now` before it schedules anything. */
  #listen(): void {
    if (this.#listening) return
    this.#listening = true

    this.#visibility.onChange(() => {
      if (this.#visibility.hidden()) this.#stop()
      else this.#start()
    })
  }
}

export const agentClock = new AgentClock()
