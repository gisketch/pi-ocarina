/** Forking a thread at a checkpoint, from the renderer's side.
 *
 *  The backend does the copy; this places the result. The fork's column lands
 *  directly right of its parent — position is half of how the pair reads as a
 *  pair, the `Fork - ` title being the other half. Both threads stay normal
 *  strip columns afterwards; nothing here is remembered. */

import type { ThreadId } from '../../../../shared/thread-id'
import { describe } from './catalog-build'
import { session } from '../session'
import { catalog } from './catalog.svelte'
import { threads } from './threads.svelte'
import { toasts } from './toasts.svelte'

/** Forks `parentId` at `checkpointId` into a new column right of the parent.
 *  Returns the new column's index in its workspace, or null when the fork
 *  could not happen — no live backend, the parent has left the strip, or the
 *  backend refused (which lands in a toast, the caller has no surface). */
export async function forkAtCheckpoint(
  parentId: ThreadId,
  checkpointId: string,
): Promise<number | null> {
  if (catalog.source !== 'live') return null

  const workspace = catalog.workspaces.find((candidate) =>
    candidate.threads.some((thread) => thread.id === parentId),
  )
  const parent = workspace?.threads.find((thread) => thread.id === parentId)
  if (!workspace || !parent) return null

  const title = `Fork - ${parent.title}`
  try {
    const { threadId } = await session.invoke('forkThread', {
      threadId: parentId,
      checkpointId,
      title,
    })

    threads.follow(threadId)
    // The fork shares the parent's folder, so it carries the parent's branch —
    // the column must know it is isolated without waiting for a relaunch.
    catalog.placeAfter(workspace.id, parentId, {
      id: threadId,
      title,
      status: 'idle',
      meta: '',
      branch: parent.branch ?? null,
    })

    const placed = catalog.workspaces.find((candidate) => candidate.id === workspace.id)
    return placed?.threads.findIndex((thread) => thread.id === threadId) ?? null
  } catch (cause) {
    toasts.push({ tone: 'error', text: describe(cause) })
    return null
  }
}
