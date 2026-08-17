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

/** The desktop app's starting state: nothing pinned. The bridge is mocked as
 *  present above, so this is the `empty` branch, not the harness's demo. */
beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = []
  catalog.source = 'empty'
  catalog.error = null
  picker.pick = '/code/pinned'
  app.goWorkspace(0)
  app.focus = []
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

  it('carries the branch onto the column it just made', async () => {
    emptyListingAfterCreate()
    await catalog.load()

    await catalog.newThread('w1', { branch: 'fix/OCA-231' })

    // Nothing re-lists the workspace after a creation, so a column built
    // without its branch would not know it is isolated until the app restarts
    // — and the sweep would offer its checkout for removal while an agent was
    // still writing in it.
    expect(catalog.workspaces[0].threads.at(-1)?.branch).toBe('fix/OCA-231')
  })

  it('leaves an ordinary thread with no branch', async () => {
    emptyListingAfterCreate()
    await catalog.load()

    await catalog.newThread('w1')

    expect(catalog.workspaces[0].threads.at(-1)?.branch).toBeNull()
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

describe('closing a thread', () => {
  async function twoThreads() {
    backend([WORKSPACE], {
      w1: [
        { id: 's1', title: 'first', modified: '2026-08-15T14:02:00Z', messageCount: 3 },
        { id: 's2', title: 'second', modified: '2026-08-15T09:30:00Z', messageCount: 2 },
      ],
    })
    await catalog.load()
  }

  it('takes the column off the strip', async () => {
    await twoThreads()

    catalog.closeThread('s1')

    expect(catalog.workspaces[0].threads.map((thread) => thread.id)).toEqual(['s2'])
  })

  it('tells the backend to keep it hidden after a relaunch', async () => {
    await twoThreads()
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)

    catalog.closeThread('s1')

    expect(invoke).toHaveBeenCalledWith('archiveThread', { threadId: 's1' })
  })

  it('gives a workspace its fresh column back when the last thread closes', async () => {
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'only', modified: '2026-08-15T14:02:00Z', messageCount: 3 }],
    })
    await catalog.load()

    catalog.closeThread('s1')

    // A workspace with no columns is a workspace you cannot type into.
    expect(catalog.workspaces[0].threads).toEqual([
      { id: 'fresh:w1', title: 'pi-core', status: 'idle', meta: 'fresh thread', fresh: true },
    ])
  })

  it('pulls the focused column back in range', async () => {
    await twoThreads()
    app.focusThread(1)

    catalog.closeThread('s2')

    expect(app.threadIndex).toBe(0)
  })

  it('leaves other workspaces alone', async () => {
    backend([WORKSPACE, { ...WORKSPACE, id: 'w2', name: 'other' }], {
      w1: [{ id: 's1', title: 'a', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
      w2: [{ id: 's9', title: 'b', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
    })
    await catalog.load()

    catalog.closeThread('s1')

    expect(catalog.workspaces[1].threads.map((thread) => thread.id)).toEqual(['s9'])
  })
})

describe('reopening a closed thread', () => {
  it('puts it back on the strip and returns its column', async () => {
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'kept', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
    })
    await catalog.load()

    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    const column = await catalog.reopen('w1', 's2', 'the closed one')

    expect(invoke).toHaveBeenCalledWith('unarchiveThread', { threadId: 's2' })
    expect(column).toBe(1)
    expect(catalog.workspaces[0].threads[1]).toMatchObject({ id: 's2', title: 'the closed one' })
  })

  it('shows it even when the backend refused to forget it was closed', async () => {
    backend([WORKSPACE], { w1: [] })
    await catalog.load()

    vi.spyOn(session, 'invoke').mockRejectedValue(new Error('catalog is read-only'))
    const column = await catalog.reopen('w1', 's2', 'the closed one')

    // The thread is on screen now; it simply will not stay after a relaunch.
    expect(column).toBe(0)
    expect(catalog.error).toBe('catalog is read-only')
  })

  it('does not double a thread that is already on the strip', async () => {
    backend([WORKSPACE], {
      w1: [{ id: 's1', title: 'kept', modified: '2026-08-15T14:02:00Z', messageCount: 1 }],
    })
    await catalog.load()

    vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)
    await catalog.reopen('w1', 's1', 'kept')

    expect(catalog.workspaces[0].threads.map((thread) => thread.id)).toEqual(['s1'])
  })
})
