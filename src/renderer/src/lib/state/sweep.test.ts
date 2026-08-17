import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../session', () => ({ session: { invoke: (...args: unknown[]) => invoke(...args) } }))

const { sweep } = await import('./sweep.svelte')
const { app } = await import('./app.svelte')
const { catalog } = await import('./catalog.svelte')
const { confirm } = await import('./confirm.svelte')
const { toasts } = await import('./toasts.svelte')

const WORKSPACE = {
  id: 'w1',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  git: null,
  snippet: '/code/pi-core',
  threads: [
    { id: 's1', title: 'open', status: 'idle' as const, meta: '', branch: 'feat/live' },
  ],
}

function tree(branch: string, over: Partial<{ dirty: number; commits: number }> = {}): unknown {
  return { branch, path: `/repo/.ocarina/worktrees/${branch}`, dirty: 0, commits: 0, ...over }
}

beforeEach(() => {
  invoke.mockReset()
  toasts.reset()
  sweep.close()
  if (confirm.pending) confirm.answer(false)
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
})

describe('the sweep', () => {
  it('lists the workspace’s worktrees and marks the ones with a thread open', async () => {
    invoke.mockResolvedValueOnce({ worktrees: [tree('feat/live'), tree('feat/spent')] })

    await sweep.show()

    expect(invoke).toHaveBeenCalledWith('listWorktrees', { workspaceId: 'w1' })
    expect(sweep.entries.map((one) => [one.branch, one.live])).toEqual([
      ['feat/live', true],
      ['feat/spent', false],
    ])
  })

  it('removes a clean one without a question', async () => {
    invoke
      .mockResolvedValueOnce({ worktrees: [tree('feat/spent')] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ worktrees: [] })

    await sweep.show()
    await sweep.remove()

    expect(invoke).toHaveBeenNthCalledWith(2, 'removeWorktree', {
      workspaceId: 'w1',
      path: '/repo/.ocarina/worktrees/feat/spent',
      force: false,
    })
    expect(sweep.entries).toEqual([])
  })

  it('refuses one with a thread open, before asking git', async () => {
    invoke.mockResolvedValueOnce({ worktrees: [tree('feat/live')] })

    await sweep.show()
    await sweep.remove()

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(toasts.items[0]?.text).toBe('feat/live has a thread open')
    expect(sweep.removable).toBe(false)
  })

  it('refuses one holding commits', async () => {
    invoke.mockResolvedValueOnce({ worktrees: [tree('feat/kept', { commits: 3 })] })

    await sweep.show()
    await sweep.remove()

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(toasts.items[0]?.text).toBe('feat/kept holds 3 commits')
  })

  it('asks before discarding uncommitted work', async () => {
    invoke
      .mockResolvedValueOnce({ worktrees: [tree('feat/dirty', { dirty: 2 })] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ worktrees: [] })

    await sweep.show()
    const removing = sweep.remove()
    await vi.waitFor(() => expect(confirm.pending).toBe(true))
    confirm.answer(true)
    await removing

    expect(invoke).toHaveBeenNthCalledWith(2, 'removeWorktree', expect.objectContaining({ force: true }))
  })

  it('keeps it when the reader says no', async () => {
    invoke.mockResolvedValueOnce({ worktrees: [tree('feat/dirty', { dirty: 1 })] })

    await sweep.show()
    const removing = sweep.remove()
    await vi.waitFor(() => expect(confirm.pending).toBe(true))
    confirm.answer(false)
    await removing

    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('says what git refused', async () => {
    invoke
      .mockResolvedValueOnce({ worktrees: [tree('feat/spent')] })
      .mockResolvedValueOnce({ ok: false, reason: 'the branch holds commits' })

    await sweep.show()
    await sweep.remove()

    expect(toasts.items[0]).toMatchObject({ tone: 'error' })
  })

  it('moves and closes from the keyboard', async () => {
    invoke.mockResolvedValueOnce({ worktrees: [tree('a'), tree('b')] })
    await sweep.show()

    sweep.handleKey({ key: 'j' })
    expect(sweep.at).toBe(1)
    sweep.handleKey({ key: 'j' })
    expect(sweep.at).toBe(1)
    sweep.handleKey({ key: 'k' })
    expect(sweep.at).toBe(0)

    expect(sweep.handleKey({ key: 'Shift' })).toBe(false)
    sweep.handleKey({ key: 'Escape' })
    expect(sweep.open).toBe(false)
  })
})
