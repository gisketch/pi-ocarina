/** What happens to a worktree when its column closes.
 *
 *  Three rules, and the difference between them is what a reader stands to
 *  lose. A clean checkout with no commits is removed without a word: nothing
 *  is lost, and a dialog on every close would train the reader to answer
 *  before reading. Uncommitted work is asked about, because only the reader
 *  knows whether it matters. Commits are never removed at all — the commits
 *  are the work, and a clean tree is no evidence they have gone anywhere. */

import type { ThreadId } from '../../../../shared/thread-id'
import { confirm } from './confirm.svelte'
import { session } from '../session'
import { toasts } from './toasts.svelte'

export async function settleWorktree(threadId: ThreadId): Promise<void> {
  const found = await session
    .invoke('threadWorktree', { threadId })
    .then(({ worktree }) => worktree)
    .catch(() => null)
  if (!found) return

  if (found.commits > 0) {
    // Kept, and said so once. A branch that survived silently is a branch the
    // reader will not think to look for.
    toasts.push({
      tone: 'info',
      text: `kept ${found.branch} · ${found.commits} commit${found.commits === 1 ? '' : 's'}`,
    })
    return
  }

  if (found.dirty > 0) {
    const discard = await confirm.ask({
      title: 'DISCARD WORKTREE',
      message: `${found.branch} has ${found.dirty} uncommitted file${
        found.dirty === 1 ? '' : 's'
      }. Discarding removes the checkout and everything written in it.`,
      confirmLabel: 'discard',
    })
    if (!discard) {
      toasts.push({ tone: 'info', text: `kept ${found.branch}` })
      return
    }
  }

  const { ok, reason } = await session
    .invoke('removeThreadWorktree', { threadId, force: found.dirty > 0 })
    .catch((cause: unknown) => ({
      ok: false,
      reason: cause instanceof Error ? cause.message : String(cause),
    }))

  // Success is silent: the reader asked for the column to go, and it went.
  if (!ok) toasts.push({ tone: 'error', text: `kept ${found.branch} · ${reason ?? 'git refused'}` })
}
