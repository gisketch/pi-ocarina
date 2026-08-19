/** Forking a thread at a checkpoint.
 *
 *  The copy is pi's own: `createBranchedSession` writes a new session file
 *  holding only the root-to-checkpoint path, in the same directory, with a
 *  header pointing back at the parent. Nothing is replayed and no tokens are
 *  spent — the fork is a file, then a session opened over it.
 *
 *  The one trap, pinned by `fork-session.test.ts`: `createBranchedSession`
 *  MUTATES the manager it is called on — the manager becomes the fork. Called
 *  on the live parent's own manager it would hijack the parent session. So the
 *  fork goes through a second manager opened over the parent's file: the
 *  mutation lands there, and that manager then simply is the fork's.
 *
 *  The fork shares the parent's folder, worktree included. It is a
 *  compare-conversations tool; isolation is what worktree threads are for. */

import { adoptSession } from './thread-open'
import { renameThread } from './thread-title'
import { openingDeps, type DriverParts } from './driver-deps'
import type { Thread } from './thread-registry'

/** Copies `parent` at `checkpointId` into a new live thread named `title`.
 *  Returns the new thread id. The parent is untouched — its file, its leaf,
 *  its running turn if it has one. */
export async function forkThread(
  parts: DriverParts,
  parentId: string,
  parent: Thread,
  checkpointId: string,
  title: string,
): Promise<string> {
  const parentFile = parent.session.sessionManager.getSessionFile()
  if (parentFile === undefined) {
    throw new Error('this thread has no session file to fork')
  }

  // The throwaway copy the mutation is allowed to eat. After the call it holds
  // the fork: a new session id, a new file beside the parent's, and only the
  // root-to-checkpoint entries. pi throws here if the checkpoint id is not an
  // entry of the session.
  const { SessionManager } = await parts.sessions.load()
  const manager = SessionManager.open(parentFile)
  manager.createBranchedSession(checkpointId)

  // The fork lives where the parent lives (D2): same cwd, same branch, and so
  // the same workspace strip after a restart. The parent's live location wins
  // over the file header — old sessions have an empty header cwd.
  const cwd = parts.workspaces.cwdOf(parentId) ?? manager.getCwd()
  const branch = parts.workspaces.branchOf(parentId)
  const workspaceId = parts.workspaces.idForPath(cwd)

  const session = await parts.sessions.open(cwd, workspaceId, manager, manager.getSessionId())
  const threadId = adoptSession(openingDeps(parts), session, cwd, branch)

  // Named by the caller — `Fork - <parent title>` — so the strip can tell the
  // pair apart. The name is a session entry, so it survives a restart.
  const thread = parts.threads.find(threadId)
  if (thread) renameThread(parts.emit, threadId, thread, title)

  return threadId
}
