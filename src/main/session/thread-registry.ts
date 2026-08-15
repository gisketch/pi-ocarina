import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { PiTranslator } from './pi-translate'

/** One open thread and everything the driver holds on its behalf. */
export interface Thread {
  session: AgentSession
  unsubscribe: () => void
  /** Kept so a cancelled turn can settle the rows it abandoned. */
  translator: PiTranslator
  /** The last thing the user asked, so a failed turn can be run again. */
  lastPrompt?: string
  /** Counts prompts, so each user block gets an id of its own. */
  prompts: number
}

/** The set of threads currently hosted in this process.
 *
 *  Closing is the part worth keeping in one place: a thread that goes away
 *  while something waits on it must release that waiter, or the agent blocks
 *  forever on an answer nobody can give. */
export class ThreadRegistry {
  #threads = new Map<string, Thread>()

  /** Called for a thread being closed, before its session is disposed. Where
   *  the approval gate and the steer queue let go of it. */
  readonly #release: (threadId: string) => void

  constructor(release: (threadId: string) => void) {
    this.#release = release
  }

  has(threadId: string): boolean {
    return this.#threads.has(threadId)
  }

  add(threadId: string, thread: Thread): void {
    this.#threads.set(threadId, thread)
  }

  /** The thread `threadId` names. Throws rather than returning undefined: every
   *  caller is acting on a thread the user is looking at, and a silent no-op
   *  would leave them waiting on something that never happens. */
  get(threadId: string): Thread {
    const thread = this.#threads.get(threadId)
    if (!thread) throw new Error(`unknown thread: ${threadId}`)
    return thread
  }

  find(threadId: string): Thread | undefined {
    return this.#threads.get(threadId)
  }

  ids(): string[] {
    return [...this.#threads.keys()]
  }

  close(threadId: string): void {
    const thread = this.#threads.get(threadId)
    if (!thread) return

    thread.unsubscribe()
    this.#release(threadId)
    thread.session.dispose()
    this.#threads.delete(threadId)
  }

  closeAll(): void {
    for (const threadId of this.ids()) this.close(threadId)
  }

  /** Threads with a turn in flight. Quitting on top of these would abandon work
   *  the user cannot see, so the app asks first. */
  running(): string[] {
    return [...this.#threads]
      .filter(([, thread]) => thread.session.isStreaming)
      .map(([threadId]) => threadId)
  }

  /** Stops every turn cleanly so the session files stay valid. */
  async abortAll(): Promise<void> {
    await Promise.all(
      [...this.#threads.values()].map((thread) => thread.session.abort().catch(() => undefined)),
    )
  }
}
