/** The voices on offer, and the one this thread is writing in.
 *
 *  Main owns the answer: the modes live in the catalog and the override lives
 *  beside the session. This is a copy the picker and the status bar draw.
 *
 *  The browser harness has no backend, so it keeps the same shapes in memory —
 *  a picker that could not be opened cannot be reviewed against the design. */

import { modeChip, SHIPPED_MODES, type ChatMode } from '../../../../shared/chat-modes'
import { session } from '../session'

class ModeState {
  all = $state.raw<ChatMode[]>([])
  /** The id in force for the focused thread, or none. */
  current = $state<string | undefined>(undefined)
  /** Whether that came from the thread rather than from the default. */
  overridden = $state(false)

  #threadId = ''
  /** Harness only: what the fake backend remembers. */
  #demoDefault: string | undefined = undefined
  #demoThread = new Map<string, string | undefined>()

  get mode(): ChatMode | undefined {
    return this.all.find((one) => one.id === this.current)
  }

  /** What the status bar draws. Null when no mode is set. */
  get chip(): string | null {
    return modeChip(this.mode)
  }

  async load(threadId: string): Promise<void> {
    this.#threadId = threadId

    if (!session.wired) {
      this.all = [...SHIPPED_MODES]
      this.current = this.#demoThread.get(threadId) ?? this.#demoDefault
      this.overridden = this.#demoThread.has(threadId)
      return
    }

    const answer = await session.invoke('listModes', { threadId })
    this.all = answer.modes
    this.current = answer.current
    this.overridden = answer.overridden
  }

  /** Sets this thread's own voice. `undefined` returns it to the default. */
  async setThread(modeId: string | undefined): Promise<void> {
    if (this.#threadId === '') return

    if (!session.wired) {
      if (modeId === undefined) this.#demoThread.delete(this.#threadId)
      else this.#demoThread.set(this.#threadId, modeId)
      await this.load(this.#threadId)
      return
    }

    await session.invoke('setThreadMode', { threadId: this.#threadId, modeId })
    await this.load(this.#threadId)
  }

  /** Sets the voice every thread starts on. */
  async setDefault(modeId: string | undefined): Promise<void> {
    if (!session.wired) {
      this.#demoDefault = modeId
      await this.load(this.#threadId)
      return
    }

    await session.invoke('setDefaultMode', { modeId })
    await this.load(this.#threadId)
  }
}

export const modes = new ModeState()
