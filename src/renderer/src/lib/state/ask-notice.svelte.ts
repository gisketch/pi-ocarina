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

import { revealBlock } from './block-focus.svelte'
import { app } from './app.svelte'
import { askKeys } from './ask-keys.svelte'
import { catalog } from './catalog.svelte'
import { columnBody, scrollRest } from './columns'
import { toasts } from './toasts.svelte'

/** How near the bottom counts as "following the thread" rather than reading
 *  back through it. One question's worth of slack, so a reader who is a line or
 *  two off the end is still taken to it. */
const NEAR_BOTTOM = 120

class AskNotice {
  /** Threads whose pending question is below the reader's view. What the
   *  sticky bar is drawn from. */
  #below = $state.raw<Record<string, true>>({})

  /** Whether this column should show its "a question is below" bar. */
  belowIn(threadId: string): boolean {
    return this.#below[threadId] === true && askKeys.pendingIn(threadId) !== null
  }

  /** A question has just arrived in a thread. */
  arrived(threadId: string, askId: string): void {
    const focused = app.thread.id === threadId
    const body = columnBody(threadId)

    if (focused && (body === undefined || scrollRest(body) <= NEAR_BOTTOM)) {
      // Following the thread: bring the question into view with its label
      // above it, the same reveal walking the transcript uses.
      revealBlock(threadId, askId, 'nearest')
      this.#clearBelow(threadId)
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

  #toast(threadId: string): void {
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
