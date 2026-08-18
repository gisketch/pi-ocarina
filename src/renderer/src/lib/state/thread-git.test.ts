import type { ThreadId } from '../../../../shared/thread-id'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitStatus } from '../../../../shared/protocol'

const invoke = vi.fn()
vi.mock('../session', () => ({ session: { invoke: (...args: unknown[]) => invoke(...args) } }))

const { threadGit } = await import('./thread-git.svelte')

function status(branch: string): GitStatus {
  return {
    branch,
    detached: false,
    ahead: 0,
    behind: 0,
    added: 0,
    modified: 1,
    deleted: 0,
    untracked: 0,
    conflicts: 0,
  }
}

beforeEach(() => {
  invoke.mockReset()
  threadGit.forget('t1')
})

describe('threadGit', () => {
  it('knows nothing until it has asked', () => {
    expect(threadGit.statusOf('t1')).toBeNull()
  })

  it('keeps what the backend answered', async () => {
    invoke.mockResolvedValue({ status: status('fix/OCA-231') })

    threadGit.refresh('t1' as ThreadId)
    await vi.waitFor(() => expect(threadGit.statusOf('t1')?.branch).toBe('fix/OCA-231'))
    expect(invoke).toHaveBeenCalledWith('threadGit', { threadId: 't1' })
  })

  it('asks once while an answer is still out', async () => {
    let settle = (): void => {}
    invoke.mockReturnValue(
      new Promise((resolve) => {
        settle = () => resolve({ status: status('wip') })
      }),
    )

    threadGit.refresh('t1' as ThreadId)
    threadGit.refresh('t1' as ThreadId)
    threadGit.refresh('t1' as ThreadId)
    expect(invoke).toHaveBeenCalledTimes(1)

    settle()
    await vi.waitFor(() => expect(threadGit.statusOf('t1')?.branch).toBe('wip'))
  })

  it('keeps the last answer when a read fails', async () => {
    invoke.mockResolvedValueOnce({ status: status('held') })
    threadGit.refresh('t1' as ThreadId)
    await vi.waitFor(() => expect(threadGit.statusOf('t1')?.branch).toBe('held'))

    invoke.mockRejectedValueOnce(new Error('no'))
    threadGit.refresh('t1' as ThreadId)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))

    expect(threadGit.statusOf('t1')?.branch).toBe('held')
  })

  it('never asks about a thread with no id', () => {
    threadGit.refresh('' as ThreadId)
    expect(invoke).not.toHaveBeenCalled()
  })
})
