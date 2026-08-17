/** How a thread comes into existence.
 *
 *  Two keystrokes reach here — leader-n, and the first send in a fresh column —
 *  and both must ask the same question in the same order, or a worktree would
 *  depend on which way the reader started the thread. */

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { git } from './git.svelte'
import { worktreeAsk } from './worktree-ask.svelte'

/** Asks about a worktree, then creates the thread. Returns its id, or null
 *  when nothing was made — a branch git would not take, or a reader who backed
 *  out of the question.
 *
 *  Only a repository is asked, and the answer is waited for: `git` is null both
 *  for a plain folder and for a repository nobody has read yet, so a freshly
 *  pinned repository would never be asked about at all — its first thread, the
 *  one most likely to want its own branch, is exactly the one that would miss
 *  the question. */
export async function createThread(workspaceId: string): Promise<string | null> {
  await git.settled(workspaceId)
  if (app.workspace.id !== workspaceId || app.workspace.git === null) {
    return catalog.newThread(workspaceId)
  }

  // The question owns the creation from here: it is the pending state while
  // git runs, and the place a refused branch name is reported.
  return worktreeAsk.run(workspaceId, (choice) =>
    catalog.newThread(workspaceId, choice ?? undefined),
  )
}
