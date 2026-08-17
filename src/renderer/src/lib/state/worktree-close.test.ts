import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../session', () => ({ session: { invoke: (...args: unknown[]) => invoke(...args) } }))

const { settleWorktree } = await import('./worktree-close')
const { confirm } = await import('./confirm.svelte')
const { toasts } = await import('./toasts.svelte')

function worktree(over: Partial<{ dirty: number; commits: number }> = {}): unknown {
  return {
    worktree: { branch: 'fix/OCA-231', path: '/repo/.ocarina/worktrees/fix-OCA-231', dirty: 0, commits: 0, ...over },
  }
}

beforeEach(() => {
  invoke.mockReset()
  toasts.reset()
  if (confirm.pending) confirm.answer(false)
})

describe('settleWorktree', () => {
  it('does nothing for a thread with no worktree', async () => {
    invoke.mockResolvedValueOnce({ worktree: null })

    await settleWorktree('t1')

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(toasts.items).toEqual([])
  })

  it('removes a clean worktree without asking, and without a word', async () => {
    invoke.mockResolvedValueOnce(worktree()).mockResolvedValueOnce({ ok: true })

    await settleWorktree('t1')

    expect(invoke).toHaveBeenLastCalledWith('removeThreadWorktree', {
      threadId: 't1',
      force: false,
    })
    expect(confirm.pending).toBe(false)
    expect(toasts.items).toEqual([])
  })

  it('never removes a worktree holding commits', async () => {
    invoke.mockResolvedValueOnce(worktree({ commits: 2 }))

    await settleWorktree('t1')

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(toasts.items[0]?.text).toBe('kept fix/OCA-231 · 2 commits')
  })

  it('asks before discarding uncommitted work, and keeps it on no', async () => {
    invoke.mockResolvedValueOnce(worktree({ dirty: 3 }))

    const settled = settleWorktree('t1')
    await vi.waitFor(() => expect(confirm.pending).toBe(true))
    expect(confirm.request?.message).toContain('3 uncommitted files')
    confirm.answer(false)
    await settled

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(toasts.items[0]?.text).toBe('kept fix/OCA-231')
  })

  it('forces the removal when the reader said discard', async () => {
    invoke.mockResolvedValueOnce(worktree({ dirty: 1 })).mockResolvedValueOnce({ ok: true })

    const settled = settleWorktree('t1')
    await vi.waitFor(() => expect(confirm.pending).toBe(true))
    confirm.answer(true)
    await settled

    expect(invoke).toHaveBeenLastCalledWith('removeThreadWorktree', { threadId: 't1', force: true })
    expect(toasts.items).toEqual([])
  })

  it('says what git refused, rather than claiming the tree is gone', async () => {
    invoke
      .mockResolvedValueOnce(worktree())
      .mockResolvedValueOnce({ ok: false, reason: 'the branch holds commits' })

    await settleWorktree('t1')

    expect(toasts.items[0]).toMatchObject({
      tone: 'error',
      text: 'kept fix/OCA-231 · the branch holds commits',
    })
  })
})
