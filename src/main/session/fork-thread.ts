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

import { existsSync } from 'node:fs'
import type { SessionEntry } from '@earendil-works/pi-coding-agent'
import { adoptSession } from './thread-open'
import { renameThread } from './thread-title'
import { openingDeps, type DriverParts } from './driver-deps'
import type { Thread } from './thread-registry'

/** Copies `parent` up to `checkpointId` into a new live thread named `title`.
 *  Returns the new thread id, and the checkpoint message's text as `draft` —
 *  the fork's transcript ends on the last answer, and the question the reader
 *  forked at goes back into their composer. The parent is untouched — its
 *  file, its leaf, its running turn if it has one. */
export async function forkThread(
  parts: DriverParts,
  parentId: string,
  parent: Thread,
  checkpointId: string,
  title: string,
): Promise<{ threadId: string; draft: string }> {
  const parentFile = parent.session.sessionManager.getSessionFile()
  if (parentFile === undefined) {
    throw new Error('this thread has no session file to fork')
  }
  // A session file is deferred until the first assistant reply — a fork of a
  // fork that has never answered has a path but no file yet, and opening the
  // nothing behind it would fork an empty session with a cryptic error.
  if (!existsSync(parentFile)) {
    throw new Error('this thread has not been answered yet — there is nothing to fork')
  }

  // The throwaway copy the mutation is allowed to eat. After the call it holds
  // the fork: a new session id, a new file beside the parent's, and only the
  // entries from the root to just BEFORE the checkpoint.
  //
  // Before, not at: the checkpoint sits on a user message, and a copy that
  // ends on it replays as a question nobody answered — the fork opened
  // showing an interrupted turn. The reader forked to ask that question
  // differently, so its text goes back into their composer instead (`draft`),
  // and the transcript ends on the last answer.
  const { SessionManager } = await parts.sessions.load()
  const manager = SessionManager.open(parentFile)
  const checkpoint = manager.getEntry(checkpointId)
  if (checkpoint === undefined) {
    throw new Error('that checkpoint is not in this thread')
  }
  const draft = textOf(checkpoint)

  if (checkpoint.parentId === null) {
    // Forking at the very first message: there is nothing before it to copy,
    // and pi cannot write an empty branch. The fork is a brand-new session in
    // the same place — history-free, with the question as its draft.
    manager.newSession()
  } else {
    manager.createBranchedSession(checkpoint.parentId)
  }

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

  return { threadId, draft }
}

/** The words of a message entry, as composer text. Tool results and images
 *  have no place in a draft; a checkpoint is always a user message, and a
 *  user message's text is what they typed. */
function textOf(entry: SessionEntry): string {
  if (entry.type !== 'message') return ''
  const content = (entry.message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter((part) => (part as { type?: string }).type === 'text')
    .map((part) => String((part as { text?: unknown }).text ?? ''))
    .join('')
    .trim()
}
