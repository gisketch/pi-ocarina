/** Looking inside one child agent while it runs.
 *
 *  The rows under a spawn call are the record; this is the monitor. It exists
 *  because a fan-out is watched from a column that has scrolled on, and because
 *  the one question a row cannot answer — *is this one stuck?* — needs the
 *  child's own calls, its brief in full, and what it has cost so far.
 *
 *  It holds an id, not a copy: the rows keep changing under it, and a snapshot
 *  taken when the peek opened would freeze the thing the reader opened it to
 *  watch. */

import { blockFocus } from './block-focus.svelte'
import { confirm } from './confirm.svelte'
import { session } from '../session'
import { threads } from './threads.svelte'
import type { AgentEntry, Block, ToolRow } from '../thread'

/** Only what this reads. Keeps the peek testable without a DOM event. */
export interface KeyLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface Peeked {
  threadId: string
  entry: AgentEntry
  /** The child's own calls, newest last. */
  rows: ToolRow[]
}

class AgentPeek {
  /** The child being watched, or null. One at a time: a second peek would
   *  stack over the first, and `h` would then close a surface the reader
   *  cannot see. */
  #at = $state.raw<{ threadId: string; agentId: string } | null>(null)
  /** Ids cancelled from here, so a second `x` on the same child cannot ask
   *  twice while the first is still in flight. */
  readonly #stopping = new Set<string>()

  get open(): boolean {
    return this.#at !== null
  }

  /** Everything the peek draws, read fresh from the thread each paint. */
  get peeked(): Peeked | null {
    const at = this.#at
    if (!at) return null

    const found = findAgent(threads.get(at.threadId)?.blocks ?? [], at.agentId)
    // The row can go: a thread reset, a restored checkpoint, a replay. A peek
    // pointing at nothing closes itself rather than drawing an empty box.
    if (!found) return null

    return { threadId: at.threadId, entry: found.agent!, rows: found.children ?? [] }
  }

  /** Opens on whichever agent row is focused in this thread, if any. */
  openAt(threadId: string, navId: string | null): boolean {
    if (!navId) return false

    const agentId = navId.slice(navId.indexOf(':') + 1)
    const found = findAgent(threads.get(threadId)?.blocks ?? [], agentId)
    if (!found?.agent) return false

    this.#at = { threadId, agentId }
    return true
  }

  close(): void {
    this.#at = null
  }

  /** The thread's column has gone. A peek left pointing at it would own `h` and
   *  `escape` over a column it is not drawn in. */
  forget(threadId: string): void {
    if (this.#at?.threadId === threadId) this.close()
  }

  /** Stops the child being watched. Its siblings keep running.
   *
   *  Confirms first: this is a destructive key inside a surface that is
   *  otherwise only for looking, and the work it throws away is not recoverable
   *  — a cancelled child reports nothing at all. */
  async stop(): Promise<void> {
    const peeked = this.peeked
    if (!peeked || peeked.entry.status !== 'running') return
    if (this.#stopping.has(peeked.entry.id)) return

    const ok = await confirm.ask({
      title: 'STOP AGENT',
      message: `${peeked.entry.name} loses everything it has done. Its siblings keep running.`,
      confirmLabel: 'stop',
    })
    if (!ok) return

    this.#stopping.add(peeked.entry.id)
    try {
      await session.invoke('cancelAgent', {
        threadId: peeked.threadId,
        agentId: peeked.entry.id,
      })
    } finally {
      this.#stopping.delete(peeked.entry.id)
    }
  }

  /** `l` descends into the focused child, `h` comes back, `x` stops it.
   *
   *  `h` and `l` move thread focus everywhere else in the shell. They are
   *  shadowed only while the peek is open, or while an agent row is focused and
   *  `l` therefore has somewhere to descend into — so both keys are unchanged
   *  in front of every other kind of block. Same shape as the ask card's
   *  shadowing of `j` and `k`.
   *
   *  Lives here rather than in the shell because the shell is already the
   *  longest file in the app and this is the peek's own behaviour. */
  handleKey(event: KeyLike, mode: string, threadId: string): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    // The composer's keys are the composer's: `x` in a sentence is a letter.
    // LEADER's are the chord's: `␣ x` closes a column and `␣ h` moves a thread,
    // and a peek that ate them would stop a child instead. Found in review.
    if (mode === 'INSERT' || mode === 'LEADER') return false

    // A peek belongs to the column it was opened in. When the reader moves to
    // another thread it has nothing to show them, and leaving it open would
    // give it `h` and `escape` in a column it is not even drawn over.
    if (this.#at && this.#at.threadId !== threadId) this.close()

    if (this.open) {
      if (event.key === 'h' || event.key === 'Escape') {
        this.close()
        return true
      }
      // Only while there is something to stop: `x` on a settled child would
      // otherwise be swallowed for no reason.
      if (event.key === 'x' && this.peeked?.entry.status === 'running') {
        void this.stop()
        return true
      }
      // Everything else falls through: the peek is somewhere to look from, not
      // a mode that swallows the shell.
      return false
    }

    if (event.key !== 'l') return false
    return this.openAt(threadId, blockFocus.idOf(threadId))
  }
}

/** The agent row with this id, at any depth. */
function findAgent(blocks: readonly Block[], agentId: string): ToolRow | undefined {
  for (const block of blocks) {
    if (block.kind !== 'ledger') continue
    const found = search(block.rows, agentId)
    if (found) return found
  }
  return undefined
}

function search(rows: readonly ToolRow[], agentId: string): ToolRow | undefined {
  for (const row of rows) {
    if (row.id === agentId && row.agent) return row
    const nested = search(row.children ?? [], agentId)
    if (nested) return nested
  }
  return undefined
}

export const agentPeek = new AgentPeek()
