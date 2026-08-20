import { tick } from 'svelte'
import { fileColumnId } from '../types'
import { app } from './app.svelte'
import { buffers } from './buffers.svelte'
import { shell } from './shell.svelte'

/** A file chosen intentionally is ready for motions immediately. Wait for a
 * newly-created column to mount before handing its CodeMirror the caret;
 * links elsewhere still only reveal/focus their buffer column. */
export async function openPickedFile(path: string): Promise<void> {
  const workspaceId = app.workspace.id
  const columnId = fileColumnId(workspaceId, path)
  shell.closeOverlay()

  const opened = await buffers.open(workspaceId, path)
  if (opened === null || app.thread.id !== columnId) return

  app.mode = 'NORMAL'
  await tick()
  if (app.workspace.id === workspaceId && app.thread.id === columnId) {
    buffers.enter(columnId, false)
  }
}
