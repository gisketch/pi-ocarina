/** Being told that a thread is asking something.
 *
 *  Three surfaces, and which one speaks depends on where the reader is
 *  standing. In the column, at the bottom: the question is revealed. In the
 *  column but reading history: nothing moves, and a bar at the bottom edge says
 *  there is a question below. Anywhere else: a mark on the column's header, a
 *  mark on the workspace's rail entry, and a toast that expires.
 *
 *  The toast notifies; it is not the record. The header and the transcript hold
 *  a pending question and neither times out. */

import type { ThreadId } from '../../../../shared/thread-id'
import { revealBlock } from './block-focus.svelte'
import { app } from './app.svelte'
import { askKeys } from './ask-keys.svelte'
import { catalog } from './catalog.svelte'
import { drafts } from './drafts.svelte'
import { following } from './following.svelte'
import { toasts } from './toasts.svelte'

class AskNotice {
  /** Threads whose pending question is below the reader's view. What the
   *  sticky bar is drawn from. */
  #below = $state.raw<Record<string, true>>({})

  /** Whether this column should show its "a question is below" bar. */
  belowIn(threadId: string): boolean {
    return this.#below[threadId] === true && askKeys.pendingIn(threadId) !== null
  }

  /** A question has just arrived in a thread. */
  arrived(threadId: ThreadId, askId: string): void {
    const focused = app.thread.id === threadId

    // Whether the reader is following, not where the scroll happens to be.
    // The ask block was added in this same batch, so the column has grown and
    // the pin has not run yet: the old position measured a long way from a
    // bottom that had just moved, and a reader who had sent a message and was
    // waiting for the answer got "a question below" instead of the question.
    if (focused && following.of(threadId).following) {
      // Following the thread: bring the question into view with its label
      // above it, the same reveal walking the transcript uses.
      revealBlock(threadId, askId, 'nearest')
      this.#clearBelow(threadId)
      // And the keys. A question arriving over an empty composer is one the
      // reader is waiting for; leaving them in INSERT made them click the card
      // before they could answer it. A half-typed message still wins — that is
      // what the composer's rank is for.
      if (app.mode === 'INSERT' && drafts.get(threadId).trim() === '') app.mode = 'NORMAL'
    } else if (focused) {
      // Reading history. Nothing moves — that is the complaint the whole
      // reveal rule exists to avoid — and the bar carries it instead.
      this.#below = { ...this.#below, [threadId]: true }
    }

    this.#toast(threadId)
  }

  /** The reader went to the question, so the bar has nothing to say. */
  seen(threadId: string): void {
    this.#clearBelow(threadId)
  }

  /** A question ended, however it ended. */
  settled(threadId: string): void {
    this.#clearBelow(threadId)
  }

  /** Whether a workspace holds a thread that is waiting on an answer. What the
   *  rail entry is marked from. */
  asking(workspaceId: string): boolean {
    const workspace = catalog.workspaces.find((one) => one.id === workspaceId)
    if (!workspace) return false

    return workspace.threads.some((thread) => askKeys.pendingIn(thread.id) !== null)
  }

  #toast(threadId: ThreadId): void {
    const workspace = catalog.workspaces.find((one) =>
      one.threads.some((thread) => thread.id === threadId),
    )
    const thread = workspace?.threads.find((one) => one.id === threadId)
    if (!workspace || !thread) return

    // No toast for the column the reader is already looking at: they can see
    // the question, and a toast about it would be noise about the obvious.
    if (app.thread.id === threadId && app.workspace.id === workspace.id) return

    toasts.push({
      // Its own tone: the long lifetime, because it asks the reader to decide
      // whether to go there, without the colour of something having failed. It
      // still expires — the header is what holds the fact.
      tone: 'ask',
      text: `${thread.title} is asking a question`,
      label: 'view',
      jump: { workspaceId: workspace.id, threadId, title: thread.title },
    })
  }

  #clearBelow(threadId: string): void {
    if (!(threadId in this.#below)) return
    const next = { ...this.#below }
    delete next[threadId]
    this.#below = next
  }
}

export const askNotice = new AskNotice()
