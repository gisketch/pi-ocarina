/** The voices on offer, and the one this thread is writing in.
 *
 *  Main owns the answer: the modes live in the catalog and the override lives
 *  beside the session. This is a copy the picker and the status bar draw.
 *
 *  The browser harness has no backend, so it keeps the same shapes in memory —
 *  a picker that could not be opened cannot be reviewed against the design. */

import type { ThreadId } from '../../../../shared/thread-id'
import { modeChip, SHIPPED_MODES, type ChatMode } from '../../../../shared/chat-modes'
import { session } from '../session'

class ModeState {
  all = $state.raw<ChatMode[]>([])
  /** The id in force for the focused thread, or none. */
  current = $state<string | undefined>(undefined)
  /** The voice every thread starts on, for the settings screen. */
  fallback = $state<string | undefined>(undefined)
  /** Whether that came from the thread rather than from the default. */
  overridden = $state(false)

  #threadId: ThreadId | null = null
  /** Harness only: what the fake backend remembers. Held here rather than in
   *  `all`, which `load` overwrites — without it an edited voice vanished the
   *  moment the screen reloaded itself. */
  #demoDefault: string | undefined = undefined
  #demoModes: ChatMode[] = [...SHIPPED_MODES]
  #demoThread = new Map<string, string | undefined>()

  get mode(): ChatMode | undefined {
    return this.all.find((one) => one.id === this.current)
  }

  /** What the status bar draws. Null when no mode is set. */
  get chip(): string | null {
    return modeChip(this.mode)
  }

  async load(threadId: ThreadId | null): Promise<void> {
    this.#threadId = threadId

    if (!session.wired) {
      this.all = [...this.#demoModes]
      const own = threadId === null ? undefined : this.#demoThread.get(threadId)
      const resolved = own ?? this.#demoDefault
      this.current = resolved === '' ? undefined : resolved
      this.overridden = threadId !== null && this.#demoThread.has(threadId)
      this.fallback = this.#demoDefault
      return
    }

    const answer = await session.invoke(
      'listModes',
      threadId === null ? {} : { threadId },
    )
    this.all = answer.modes
    this.current = answer.current
    this.overridden = answer.overridden
    this.fallback = answer.fallbackMode
  }

  /** Sets this thread's own voice. `undefined` returns it to the default. */
  async setThread(modeId: string | undefined): Promise<void> {
    if (this.#threadId === null) return

    if (!session.wired) {
      if (modeId === undefined) this.#demoThread.delete(this.#threadId)
      else this.#demoThread.set(this.#threadId, modeId)
      await this.load(this.#threadId)
      return
    }

    const threadId = this.#threadId
    if (threadId === null) return

    await session.invoke('setThreadMode', { threadId, modeId })
    await this.load(threadId)
  }

  /** A stable id from a name, so renaming a mode does not orphan it.
   *
   *  Made unique against what is already stored: two voices called "Terse" and
   *  "terse!" both slug to `terse`, and the second would silently overwrite the
   *  first — `saveMode` matches on id. */
  idFor(name: string): string {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const base = slug === '' ? 'mode' : slug

    const taken = new Set(this.all.map((one) => one.id))
    if (!taken.has(base)) return base
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`
      if (!taken.has(candidate)) return candidate
    }
  }

  async save(mode: ChatMode): Promise<boolean> {
    if (mode.name.trim() === '' || mode.instructions.trim() === '') return false

    if (session.wired) await session.invoke('saveMode', { mode })
    else this.#demoModes = [...this.#demoModes.filter((one) => one.id !== mode.id), mode]

    await this.load(this.#threadId)
    return true
  }

  async remove(modeId: string): Promise<void> {
    if (session.wired) await session.invoke('deleteMode', { modeId })
    else {
      this.#demoModes = this.#demoModes.filter((one) => one.id !== modeId)
      if (this.#demoDefault === modeId) this.#demoDefault = undefined
      for (const [threadId, chosen] of this.#demoThread) {
        if (chosen === modeId) this.#demoThread.delete(threadId)
      }
    }
    await this.load(this.#threadId)
  }

  /** Sets the voice every thread starts on. */
  async setDefault(modeId: string | undefined): Promise<void> {
    if (!session.wired) {
      this.#demoDefault = modeId
      await this.load(this.#threadId)
      return
    }

    await session.invoke('setDefaultMode', {
      modeId,
      // Named only when there is one to re-read. A default is for new
      // threads; a placeholder has none to refresh.
      ...(this.#threadId === null ? {} : { threadId: this.#threadId }),
    })
    await this.load(this.#threadId)
  }
}

export const modes = new ModeState()
