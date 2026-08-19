/** What a reader can do to the block they are pointing at.
 *
 *  Opened by `a`, and modal while it is open: it is a list with a highlight,
 *  the same shape as the palette and the switcher, so `⏎` means "take the
 *  highlighted row" and nothing else competes for the key.
 *
 *  This is also where restore lives now. It used to be a button on a dashed
 *  rule drawn between every user message and the rest of the thread, which cut
 *  the transcript in half for the sake of one action nobody uses often. */

import type { ThreadId } from '../../../../shared/thread-id'
import type { NavBlock } from '../blocks'
import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { changes } from './changes.svelte'
import { forkAtCheckpoint } from './fork.svelte'
import { shell } from './shell.svelte'
import { threads } from './threads.svelte'
import type { KeyEventLike } from '../keyboard'

export type BlockActionId = 'copy' | 'restore' | 'fork' | 'changes'

export interface BlockAction {
  id: BlockActionId
  label: string
}

/** Copies text, and says nothing when it cannot.
 *
 *  Clipboard access can be refused. Losing a copy is worth neither a crash nor
 *  an error the reader can do nothing about. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Refused. The reader can still select the text by hand.
  }
}

/** What is offered for a block.
 *
 *  Copy always. Restore only where there is something to rewind to — a message
 *  that pi kept as a session entry — and only against a thread the backend
 *  really has, which is the same guard the cards in a demo column apply. */
export function actionsFor(block: NavBlock, wired: boolean): BlockAction[] {
  const actions: BlockAction[] = [{ id: 'copy', label: 'copy text' }]
  // Only where there is a change to open on to. A row that read a file has a
  // path too, and offering the viewer there would open it on nothing.
  if (block.diffPath !== undefined) {
    actions.push({ id: 'changes', label: 'see the whole change' })
  }
  if (block.checkpointId !== undefined && wired) {
    actions.push({ id: 'restore', label: 'restore checkpoint' })
    // Fork sits next to restore on purpose: the same place in the session,
    // the two answers to "I want to go back" — one destroys the future, the
    // other copies it.
    actions.push({ id: 'fork', label: 'fork to a new thread' })
  }
  return actions
}

class BlockMenu {
  /** The block the menu is open on. Null when it is closed. */
  block = $state.raw<NavBlock | null>(null)
  /** Which thread it belongs to, so a menu cannot outlive its column. */
  /** The thread the menu is open over, or null when it is closed. Null rather
   *  than an empty string: the id is spent on a restore, and "no menu" must
   *  not be a value that typechecks as a thread. */
  threadId = $state.raw<ThreadId | null>(null)
  index = $state.raw(0)
  /** True once restore has been asked for and is waiting to be said twice. */
  confirming = $state.raw(false)

  get open(): boolean {
    return this.block !== null
  }

  get actions(): BlockAction[] {
    const block = this.block
    return block === null ? [] : actionsFor(block, catalog.source === 'live')
  }

  openOn(threadId: ThreadId, block: NavBlock): void {
    this.block = block
    this.threadId = threadId
    this.index = 0
    this.confirming = false
  }

  close(): void {
    this.block = null
    this.threadId = null
    this.confirming = false
  }

  /** Returns true when the key was consumed. */
  handleKey(event: KeyEventLike): boolean {
    if (event.key === 'Escape') {
      // Backing out of the question first, then out of the menu: two escapes
      // to leave a confirmed restore alone is the same bargain every other
      // destructive question in the app makes.
      if (this.confirming) this.confirming = false
      else this.close()
      return true
    }

    const actions = this.actions
    if (event.key === 'j' || event.key === 'ArrowDown') {
      this.index = Math.min(actions.length - 1, this.index + 1)
      this.confirming = false
      return true
    }
    if (event.key === 'k' || event.key === 'ArrowUp') {
      this.index = Math.max(0, this.index - 1)
      this.confirming = false
      return true
    }

    if (event.key === 'Enter') {
      this.run()
      return true
    }

    // Everything else is swallowed rather than passed down: a menu that lets
    // an unrecognised key move the column underneath it is not modal.
    return true
  }

  run(): void {
    const action = this.actions[this.index]
    const block = this.block
    if (!action || block === null) return

    if (action.id === 'changes') {
      const threadId = this.threadId
      const path = block.diffPath
      this.close()
      if (threadId === null) return
      app.mode = 'DIFF'
      void changes.show(threadId, path)
      return
    }

    if (action.id === 'copy') {
      void copyText(block.text)
      this.close()
      return
    }

    // Fork destroys nothing, so it asks nothing: one Enter, and the reader is
    // in the new column with the composer waiting for the second question.
    if (action.id === 'fork') {
      const checkpointId = block.checkpointId
      const threadId = this.threadId
      this.close()
      if (checkpointId === undefined || threadId === null) return

      void forkAtCheckpoint(threadId, checkpointId).then((column) => {
        if (column === null) return
        app.focusThread(column)
        app.mode = 'CHAT'
        shell.focusComposer()
      })
      return
    }

    // Restore rewinds a conversation. One keystroke must not do that.
    if (!this.confirming) {
      this.confirming = true
      return
    }

    const checkpointId = block.checkpointId
    const threadId = this.threadId
    this.close()
    if (checkpointId === undefined || threadId === null) return

    // No toast: the transcript itself is about to change, in the column the
    // reader is looking at. Saying it twice trains them to ignore the corner.
    threads.restore(threadId, checkpointId)
  }
}

export const blockMenu = new BlockMenu()
