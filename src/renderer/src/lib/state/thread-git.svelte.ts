/** The git state of an isolated thread's own checkout.
 *
 *  The workspace's state arrives on the git channel, pushed by a watcher. A
 *  worktree has no watcher: it is created and removed with a thread, and
 *  watching every one of them would put a file-system watcher on the strip.
 *  So this asks, at the two moments the answer can have changed — the reader
 *  looked at the thread, and a tool call it made ended.
 *
 *  A thread that is not isolated is never asked about. Its repository is the
 *  workspace's, and a second reading of the same folder is how the branch in
 *  the status bar comes to disagree with the branch in the rail. */

import type { GitStatus } from '../../../../shared/protocol'
import { session } from '../session'

class ThreadGit {
  /** Thread id → its checkout's state. Raw: entries are replaced wholesale. */
  #known = $state.raw<Record<string, GitStatus | null>>({})
  /** Threads with a read in flight, so a burst of tool calls asks once. */
  readonly #asking = new Set<string>()

  statusOf(threadId: string): GitStatus | null {
    return this.#known[threadId] ?? null
  }

  /** Asks about a thread, unless a question is already out for it. */
  refresh(threadId: string): void {
    if (threadId === '' || this.#asking.has(threadId)) return
    this.#asking.add(threadId)

    void session
      .invoke('threadGit', { threadId })
      .then(({ status }) => {
        this.#known = { ...this.#known, [threadId]: status }
      })
      .catch(() => {
        // A thread whose backend cannot answer keeps whatever it had. An empty
        // segment would read as a clean tree rather than as no answer.
      })
      .finally(() => {
        this.#asking.delete(threadId)
      })
  }

  /** Drops a thread whose column has gone. */
  forget(threadId: string): void {
    if (!(threadId in this.#known)) return
    const next = { ...this.#known }
    delete next[threadId]
    this.#known = next
  }
}

export const threadGit = new ThreadGit()
