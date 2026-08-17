/** How a thread comes into existence.
 *
 *  Two keystrokes reach here — leader-n, and the first send in a fresh column —
 *  and both must ask the same question in the same order, or a worktree would
 *  depend on which way the reader started the thread. */

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { worktreeAsk } from './worktree-ask.svelte'

/** Asks about a worktree, then creates the thread. Returns its id, or null
 *  when nothing was made — a branch git would not take, or a reader who backed
 *  out of the question.
 *
 *  Only a repository is asked. `git` is null both for a plain folder and for a
 *  repository whose first read is still out; asking in the second case would be
 *  a dialog about a branch nobody has confirmed. */
export async function createThread(workspaceId: string): Promise<string | null> {
  if (app.workspace.git === null) return catalog.newThread(workspaceId)

  // The question owns the creation from here: it is the pending state while
  // git runs, and the place a refused branch name is reported.
  return worktreeAsk.run(workspaceId, (choice) =>
    catalog.newThread(workspaceId, choice ?? undefined),
  )
}
