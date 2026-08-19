import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandName } from '../../../../shared/protocol'
import { session } from '../session'

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
  },
  isDesktop: true,
}))

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'

const WORKSPACE = {
  id: 'w1',
  path: '/code/pi-core',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  snippet: '',
  git: null,
  threads: [{ id: 't1', title: 'first', status: 'idle' as const, meta: '' }],
}

beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  catalog.error = null
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'NORMAL'
})

/** What `␣n` is for: a launcher, not a thread. The backend hears nothing. */
describe('opening a dashboard', () => {
  it('adds a dashboard column and speaks to no backend', () => {
    const invoke = vi.spyOn(session, 'invoke')

    shell.newThread()

    const threads = app.workspace.threads
    expect(threads).toHaveLength(2)
    expect(threads[1].fresh).toBe(true)
    expect(app.threadIndex).toBe(1)
    expect(app.mode).toBe('NORMAL')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('focuses the dashboard it already has instead of lining up two', () => {
    shell.newThread()
    app.focusThread(0)

    shell.newThread()

    expect(app.workspace.threads).toHaveLength(2)
    expect(app.threadIndex).toBe(1)
  })
})

describe('closing a dashboard', () => {
  it('takes the column away and leaves no orphan behind', () => {
    const invoke = vi.spyOn(session, 'invoke')
    shell.newThread()

    shell.requestClose()

    expect(app.workspace.threads).toHaveLength(1)
    expect(app.workspace.threads[0].id).toBe('t1')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('gives a workspace its dashboard straight back when it was the only column', () => {
    catalog.workspaces = [{ ...structuredClone(WORKSPACE), threads: [] }]
    const column = catalog.addDashboard('w1')
    app.focusThread(column)

    shell.requestClose()

    expect(app.workspace.threads).toHaveLength(1)
    expect(app.workspace.threads[0].fresh).toBe(true)
  })
})

/** The launcher becomes the thread it launched: same strip position. */
describe('a thread born on the dashboard', () => {
  it('replaces the dashboard column in place', async () => {
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      Promise.resolve((name === 'createThread' ? { threadId: 'made' } : { ok: true }) as never),
    )
    shell.newThread()
    // A column on the other side, so "in place" is distinguishable from "at
    // the end".
    catalog.openTerminal('w1')

    await catalog.newThread('w1')

    const ids = app.workspace.threads.map((thread) => thread.id)
    expect(ids).toEqual(['t1', 'made', 'terminal:w1'])
  })

  it('still lands on the end when no dashboard is up', async () => {
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      Promise.resolve((name === 'createThread' ? { threadId: 'made' } : { ok: true }) as never),
    )

    await catalog.newThread('w1')

    const ids = app.workspace.threads.map((thread) => thread.id)
    expect(ids).toEqual(['t1', 'made'])
  })
})
