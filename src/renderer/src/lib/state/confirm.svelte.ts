/** A destructive question, and the two words that answer it. */
export interface ConfirmRequest {
  /** The red header, e.g. `DISCARD CHANGES`. Shown upper-case by the styling. */
  title: string
  /** The sentence. Says what is lost, in the words of the thing being lost. */
  message: string
  /** The word on the go-ahead button. Names the act, never "OK". */
  confirmLabel: string
}

/** Keys that are not an answer.
 *
 *  Reaching for a capital presses Shift first. Reading that as "cancel" would
 *  dismiss the question and leave the person unsure what they just agreed to. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/** The one destructive-confirm modal.
 *
 *  Only one question is ever asked at a time: a second would stack over the
 *  first, and an `esc` would then answer a question the user could not see. A
 *  request that arrives while one is open is refused rather than queued —
 *  refusing is the safe answer for something destructive. */
class Confirm {
  request = $state.raw<ConfirmRequest | null>(null)

  #answer: ((ok: boolean) => void) | null = null

  get pending(): boolean {
    return this.request !== null
  }

  /** Asks, and resolves with what the user said. */
  ask(request: ConfirmRequest): Promise<boolean> {
    if (this.request) return Promise.resolve(false)

    this.request = request
    return new Promise<boolean>((resolve) => {
      this.#answer = resolve
    })
  }

  answer(ok: boolean): void {
    const resolve = this.#answer
    this.request = null
    this.#answer = null
    resolve?.(ok)
  }

  /** Answers from the keyboard. Returns true when the key was consumed — which
   *  is every key except a bare modifier, because the question is modal and
   *  nothing may run underneath it. */
  handleKey(event: { key: string }): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false

    if (event.key === 'Enter') this.answer(true)
    else if (event.key === 'Escape') this.answer(false)
    return true
  }
}

export const confirm = new Confirm()
