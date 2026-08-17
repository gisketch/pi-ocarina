/** How a thread comes into existence.
 *
 *  Two keystrokes reach here — leader-n, and the first send in a fresh column —
 *  and both must ask the same question in the same order, or a worktree would
 *  depend on which way the reader started the thread. */

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { chooseWorktree } from './worktree-ask.svelte'

/** Asks about a worktree, then creates the thread. Returns its id, or null
 *  when the backend refused — a branch git would not take, most often. */
export async function createThread(workspaceId: string): Promise<string | null> {
  // Only a repository is asked. `git` is null both for a plain folder and for
  // a repository whose first read is still out; asking in the second case
  // would be a dialog about a branch nobody has confirmed.
  const choice = await chooseWorktree(app.workspace.git !== null)
  return catalog.newThread(workspaceId, choice ?? undefined)
}
