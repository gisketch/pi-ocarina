import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandName } from '../../../../shared/protocol'
import { session } from '../session'

/** A stand-in for Electron's folder picker, so the pin path is reachable
 *  without a window. `pick` is what the user chose; null is a cancel. */
const picker = vi.hoisted(() => ({ pick: null as string | null }))
vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(picker.pick) },
    // The session client is built from this at import time; every test spies on
    // `session.invoke`, so this only has to exist.
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
  },
  isDesktop: true,
}))

import { app } from './app.svelte'
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

/** The starting state of the desktop app: nothing pinned, nothing to draw but
 *  the welcome screen. The bridge is mocked as present above, so this is the
 *  `empty` branch rather than the harness's demo branch. */
beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = []
  catalog.source = 'empty'
  catalog.error = null
  picker.pick = '/code/pinned'
  app.goWorkspace(0)
  app.focus = []
})

describe('before anything is pinned', () => {
  it('stays empty rather than showing demo threads', async () => {
    backend([])

    await catalog.load()

    expect(catalog.source).toBe('empty')
    expect(catalog.workspaces).toEqual([])
  })

  it('stays empty when there is no backend at all', async () => {
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('no session backend'))

    await catalog.load()

    expect(catalog.source).toBe('empty')
    expect(catalog.workspaces).toEqual([])
  })

  it('reads as an absent workspace rather than throwing', () => {
    // Every chrome segment still renders around the welcome screen.
    expect(app.workspace.id).toBe('')
    expect(app.workspace.threads).toEqual([])
    expect(app.thread.id).toBe('')
    expect(app.threadLabel).toBe('–')
  })
})

describe('the real catalog', () => {
  it('fills the strip once a folder is pinned', async () => {
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

  it('pulls the focused workspace back in range when the list shrinks', async () => {
    // A workspace can be unpinned elsewhere. An index left pointing past the
    // end leaves the rail with nothing highlighted while the rest of the
    // chrome reads a different workspace.
    backend([WORKSPACE, { ...WORKSPACE, id: 'w2' }, { ...WORKSPACE, id: 'w3' }])
    await catalog.load()
    app.goWorkspace(2)

    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'first', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
    })

    await catalog.load()

    expect(app.workspaceIndex).toBe(0)
    expect(app.workspace.id).toBe('w1')
  })

  it('pulls a remembered thread position back in range too', async () => {
    backend([WORKSPACE], {
      w1: [
        { id: 's1', title: 'a', modified: '2026-08-15T14:02:00Z', messageCount: 1 },
        { id: 's2', title: 'b', modified: '2026-08-15T14:02:00Z', messageCount: 1 },
        { id: 's3', title: 'c', modified: '2026-08-15T14:02:00Z', messageCount: 1 },
      ],
    })
    await catalog.load()
    app.focusThread(2)

    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'only one', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
    })

    await catalog.load()

    expect(app.threadIndex).toBe(0)
  })

  it('shows the workspace with a fresh column when the thread listing fails', async () => {
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

describe('pinning', () => {
  it('does nothing when the user cancels the picker', async () => {
    picker.pick = null
    const invoke = backend([WORKSPACE])

    expect(await catalog.pin()).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    expect(catalog.error).toBeNull()
  })

  it('pins the folder the user chose, then reloads', async () => {
    const invoke = backend([WORKSPACE])

    expect(await catalog.pin()).toBe(true)
    expect(invoke).toHaveBeenCalledWith('pinWorkspace', { path: '/code/pinned' })
    expect(catalog.source).toBe('live')
  })
})

describe('creating a thread', () => {
  /** Verified against pi 0.84 on 2026-08-16: pi writes no session file until
   *  the first message, so `listThreads` straight after `createThread` comes
   *  back empty. A re-listing here would delete the column it just made. */
  function emptyListingAfterCreate() {
    return vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) => {
      if (name === 'listWorkspaces') return Promise.resolve({ workspaces: [WORKSPACE] } as never)
      if (name === 'listThreads') return Promise.resolve({ threads: [] } as never)
      if (name === 'createThread') return Promise.resolve({ threadId: 'new-1' } as never)
      return Promise.resolve({ ok: true } as never)
    })
  }

  it('keeps the new column even though pi has not written the session file', async () => {
    emptyListingAfterCreate()
    await catalog.load()

    const threadId = await catalog.newThread('w1')

    expect(threadId).toBe('new-1')
    expect(catalog.workspaces[0].threads.map((thread) => thread.id)).toEqual(['new-1'])
  })

  it('replaces the fresh placeholder rather than sitting beside it', async () => {
    emptyListingAfterCreate()
    await catalog.load()
    expect(catalog.workspaces[0].threads[0].fresh).toBe(true)

    await catalog.newThread('w1')

    expect(catalog.workspaces[0].threads).toHaveLength(1)
    expect(catalog.workspaces[0].threads[0].fresh).toBeUndefined()
  })

  it('follows the thread so its events stream in', async () => {
    emptyListingAfterCreate()
    await catalog.load()
    const follow = vi.spyOn(threads, 'follow')

    await catalog.newThread('w1')

    expect(follow).toHaveBeenCalledWith('new-1')
  })

  it('appends to a workspace that already has threads', async () => {
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'first', modified: '2026-08-15T14:02:00Z', messageCount: 3 }],
    })
    await catalog.load()

    vi.spyOn(session, 'invoke').mockResolvedValue({ threadId: 'new-1' } as never)
    await catalog.newThread('w1')

    expect(catalog.workspaces[0].threads.map((thread) => thread.id)).toEqual(['s1', 'new-1'])
  })

  it('does nothing without a live workspace to start it in', async () => {
    const invoke = backend([])

    expect(await catalog.newThread('w1')).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('when an action fails', () => {
  it('reports a folder the backend refused instead of doing nothing', async () => {
    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('not a directory'))

    const pinned = await catalog.pin()

    expect(pinned).toBe(false)
    expect(catalog.error).toBe('not a directory')
  })

  it('reports a thread that could not be created', async () => {
    backend([WORKSPACE])
    await catalog.load()

    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('workspace is gone'))
    const threadId = await catalog.newThread('w1')

    expect(threadId).toBeNull()
    expect(catalog.error).toBe('workspace is gone')
  })

  it('clears the last failure when a new action starts', async () => {
    catalog.error = 'stale message'
    backend([WORKSPACE])
    await catalog.load()

    await catalog.newThread('w1')

    expect(catalog.error).toBeNull()
  })
})
