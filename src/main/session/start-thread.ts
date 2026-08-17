/** Bringing a thread into existence, checkout and all.
 *
 *  Held apart from the driver because it is the one path where two things are
 *  created together and either can fail: a git checkout, and a pi session
 *  inside it. What that costs when the second one fails is the whole reason
 *  this is a function of its own. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { deleteBranch, removeWorktree } from '../git/worktree'
import type { SessionFactory, ThreadHandle } from './session-factory'
import type { WorkspaceService } from './workspaces'

interface Deps {
  workspaces: WorkspaceService
  sessions: SessionFactory
}

/** Creates the checkout, starts the session in it, and hands the session to
 *  `adopt`, which returns the thread id. */
export async function startThread(
  { workspaces, sessions }: Deps,
  workspaceId: string,
  worktree: { branch: string } | undefined,
  adopt: (session: AgentSession, cwd: string, branch: string | null) => string,
): Promise<string> {
  // The checkout first: pi is given a working directory when the session
  // starts, so a worktree that fails to appear must stop the creation rather
  // than leave a thread running in the tree it was meant to keep out of.
  const { cwd, branch } = await workspaces.cwdForNewThread(workspaceId, worktree)
  const handle: ThreadHandle = { threadId: '' }

  let session: AgentSession
  try {
    session = await sessions.create(cwd, workspaceId, handle)
  } catch (cause) {
    // A checkout with no session in it is a directory and a branch nobody
    // asked for, standing on the path the next attempt at the same name would
    // collide with. It goes back the way it came.
    if (branch !== null) {
      const root = workspaces.pathOf(workspaceId)
      await removeWorktree(root, cwd, { force: true }).catch(() => {})
      // And the branch it was made on. `worktree remove` leaves it, which is
      // right everywhere else and wrong here: nothing was ever committed to it,
      // and leaving it would block the reader from using the name they chose.
      await deleteBranch(root, branch)
    }
    throw cause
  }

  handle.threadId = adopt(session, cwd, branch)
  return handle.threadId
}
