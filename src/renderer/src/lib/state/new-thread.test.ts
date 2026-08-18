import { threadIdForTest } from '../../../../shared/thread-id'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitStatus, GitStatusMessage } from '../../../../shared/protocol'

const created = vi.fn()
const refresh = vi.fn()
let listeners: ((message: GitStatusMessage) => void)[] = []

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
    git: {
      refresh: (...args: unknown[]) => refresh(...args),
      statuses: () => Promise.resolve([]),
      onStatus: (listener: (message: GitStatusMessage) => void) => {
        listeners.push(listener)
        return () => {}
      },
    },
    terminal: {
      create: () => Promise.resolve({ ok: true }),
      kill: () => Promise.resolve({ ok: true }),
      write: () => {},
      resize: () => {},
      busy: () => Promise.resolve({ busy: false }),
      onData: () => () => {},
    },
  },
  isDesktop: true,
}))

const { app } = await import('./app.svelte')
const { catalog } = await import('./catalog.svelte')
const { git } = await import('./git.svelte')
const { createThread } = await import('./new-thread')
const { worktreeAsk } = await import('./worktree-ask.svelte')

const STATUS: GitStatus = {
  branch: 'main',
  detached: false,
  ahead: 0,
  behind: 0,
  added: 0,
  modified: 0,
  deleted: 0,
  untracked: 0,
  conflicts: 0,
}

function workspace(id: string): unknown {
  return {
    id,
    name: id,
    note: 'D',
    hue: 152,
    git: null,
    snippet: `/code/${id}`,
    threads: [{ id: `${id}-s1`, title: 'first', status: 'idle' as const, meta: '' }],
  }
}

function answer(workspaceId: string, status: GitStatus | null): void {
  for (const listener of listeners) listener({ workspaceId, status })
}

beforeEach(() => {
  created.mockReset()
  refresh.mockReset()
  listeners = []
  if (worktreeAsk.open) worktreeAsk.no()
  catalog.workspaces = [workspace('w1') as never]
  catalog.source = 'live'
  app.goWorkspace(0)
  git.start()
  vi.spyOn(catalog, 'newThread').mockImplementation(async (id: string, worktree?: unknown) => {
    created(id, worktree)
    return threadIdForTest('t1')
  })
})

describe('createThread', () => {
  it('waits for the first git read before deciding whether to ask', async () => {
    const thread = createThread('w1')

    // Nothing is asked yet: null here means "not read", not "not a repo".
    expect(worktreeAsk.open).toBe(false)
    expect(refresh).toHaveBeenCalledWith('w1')

    answer('w1', STATUS)
    await vi.waitFor(() => expect(worktreeAsk.open).toBe(true))

    worktreeAsk.handleKey({ key: 'Escape' })
    expect(await thread).toBe('t1')
    expect(created).toHaveBeenCalledWith('w1', undefined)
  })

  it('never asks about a folder that is not a repository', async () => {
    const thread = createThread('w1')
    answer('w1', null)

    expect(await thread).toBe('t1')
    expect(worktreeAsk.open).toBe(false)
  })

  it('asks straight away once the workspace has been answered about', async () => {
    answer('w1', STATUS)

    const thread = createThread('w1')
    await vi.waitFor(() => expect(worktreeAsk.open).toBe(true))

    worktreeAsk.handleKey({ key: 'Escape' })
    await thread
  })

  it('does not ask about a workspace the reader has left', async () => {
    const thread = createThread('w2')

    expect(await thread).toBe('t1')
    expect(worktreeAsk.open).toBe(false)
    expect(created).toHaveBeenCalledWith('w2', undefined)
  })
})
