import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandName } from '../../../../shared/protocol'
import { session } from '../session'
import { catalog } from './catalog.svelte'
import { threads } from './threads.svelte'

/** Answers the two commands the catalog asks, and nothing else. */
function backend(workspaces: unknown[], threadsByWorkspace: Record<string, unknown[]> = {}) {
  return vi.spyOn(session, 'invoke').mockImplementation((name: CommandName, params) => {
    if (name === 'listWorkspaces') return Promise.resolve({ workspaces } as never)
    if (name === 'listThreads') {
      const id = (params as { workspaceId: string }).workspaceId
      return Promise.resolve({ threads: threadsByWorkspace[id] ?? [] } as never)
    }
    return Promise.resolve({ ok: true } as never)
  })
}

const WORKSPACE = { id: 'w1', path: '/code/pi-core', name: 'pi-core', note: 'D', hue: 152 }

/** The demo state as it stands before any test loads over it. */
const DEMO = catalog.workspaces

beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = DEMO
  catalog.source = 'mock'
})

describe('falling back to the demo catalog', () => {
  it('keeps the demo workspaces when nothing is pinned', async () => {
    backend([])

    await catalog.load()

    expect(catalog.source).toBe('mock')
    expect(catalog.workspaces.map((workspace) => workspace.name)).toEqual([
      'pi-core',
      'ocarina-ui',
      'docs-site',
    ])
  })

  it('keeps the demo workspaces when there is no backend at all', async () => {
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('no session backend'))

    await catalog.load()

    expect(catalog.source).toBe('mock')
    expect(catalog.workspaces.length).toBeGreaterThan(0)
  })
})

describe('the real catalog', () => {
  it('replaces the demo state entirely once a folder is pinned', async () => {
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'retry backoff', modified: '2026-08-15T14:02:00Z', messageCount: 8 }],
    })

    await catalog.load()

    expect(catalog.source).toBe('live')
    expect(catalog.workspaces).toHaveLength(1)
    expect(catalog.workspaces[0]).toMatchObject({ id: 'w1', name: 'pi-core', hue: 152, note: 'D' })
  })

  it('carries the workspace path as the switcher’s snippet', async () => {
    backend([WORKSPACE])

    await catalog.load()

    expect(catalog.workspaces[0].snippet).toBe('/code/pi-core')
  })

  it('leaves git detail empty rather than inventing a branch', async () => {
    backend([WORKSPACE])

    await catalog.load()

    expect(catalog.workspaces[0]).toMatchObject({ branch: '', git: '' })
  })

  it('lists a pinned folder’s threads as columns', async () => {
    backend([WORKSPACE], {
      w1: [
        { id: 's1', title: 'first', modified: '2026-08-15T14:02:00Z', messageCount: 8 },
        { id: 's2', title: 'second', modified: '2026-08-15T09:30:00Z', messageCount: 2 },
      ],
    })

    await catalog.load()

    expect(catalog.workspaces[0].threads.map((thread) => thread.title)).toEqual(['first', 'second'])
  })

  it('follows every listed thread so background work keeps streaming', async () => {
    const follow = vi.spyOn(threads, 'follow')
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'first', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
    })

    await catalog.load()

    expect(follow).toHaveBeenCalledWith('s1')
  })

  it('shows the fresh-thread hero for a workspace with no threads yet', async () => {
    backend([WORKSPACE], { w1: [] })

    await catalog.load()

    expect(catalog.workspaces[0].threads).toEqual([
      { id: 'fresh:w1', title: 'pi-core', status: 'idle', meta: 'fresh thread', fresh: true },
    ])
  })

  it('starts a listed thread as idle, not as a status it cannot know', async () => {
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'first', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
    })

    await catalog.load()

    expect(catalog.workspaces[0].threads[0].status).toBe('idle')
  })

  it('survives a timestamp it cannot read', async () => {
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'first', modified: 'not a date', messageCount: 1 }],
    })

    await catalog.load()

    expect(catalog.workspaces[0].threads[0].meta).toBe('')
  })

  it('keeps the demo state when the thread listing fails', async () => {
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) => {
      if (name === 'listWorkspaces') return Promise.resolve({ workspaces: [WORKSPACE] } as never)
      return Promise.reject(new Error('session store unreadable'))
    })

    await catalog.load()

    // The workspace is real, so it is shown; it simply has no threads to list.
    expect(catalog.source).toBe('live')
    expect(catalog.workspaces[0].threads[0].fresh).toBe(true)
  })
})
