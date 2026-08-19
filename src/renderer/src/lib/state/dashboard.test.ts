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
import { branchField } from './branch-field.svelte'
import { terminalId } from '../types'

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
  app.mode = 'OCARINA'
})

/** What `␣n` is for: a launcher, not a thread. The backend hears nothing. */
describe('opening a dashboard', () => {
  it('adds a dashboard column and creates nothing in the backend', () => {
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ threads: [] } as never)

    shell.newThread()

    const threads = app.workspace.threads
    expect(threads).toHaveLength(2)
    expect(threads[1].fresh).toBe(true)
    expect(app.threadIndex).toBe(1)
    expect(app.mode).toBe('OCARINA')
    // The launcher reads history for its recent rows; it must write nothing.
    expect(invoke).not.toHaveBeenCalledWith('createThread', expect.anything())
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
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ threads: [] } as never)
    shell.newThread()

    shell.requestClose()

    expect(app.workspace.threads).toHaveLength(1)
    expect(app.workspace.threads[0].id).toBe('t1')
    expect(invoke).not.toHaveBeenCalledWith('createThread', expect.anything())
    expect(invoke).not.toHaveBeenCalledWith('archiveThread', expect.anything())
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
    catalog.openTerminal('w1', 't1', terminalId('w1', 't1'))

    await catalog.newThread('w1')

    const ids = app.workspace.threads.map((thread) => thread.id)
    expect(ids).toEqual(['t1', 'made', terminalId('w1', 't1')])
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

describe('the worktree flow on the dashboard', () => {
  async function drain(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('opens the field on b, only on a dashboard in a repository', () => {
    catalog.workspaces = [{ ...structuredClone(WORKSPACE), git: { branch: 'main' } as never }]
    shell.handleKey({ key: 'b' })
    expect(branchField.columnId).toBeNull()

    shell.newThread()
    shell.handleKey({ key: 'b' })
    expect(branchField.columnId).toBe(app.thread.id)
    branchField.close()
  })

  it('stays shut without a git to branch in', () => {
    shell.newThread()
    shell.handleKey({ key: 'b' })
    expect(branchField.columnId).toBeNull()
  })

  it('types a name, creates, and the thread takes the dashboard column', async () => {
    catalog.workspaces = [{ ...structuredClone(WORKSPACE), git: { branch: 'main' } as never }]
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      Promise.resolve(
        (name === 'createThread'
          ? { threadId: 'made' }
          : name === 'listWorktrees'
            ? { worktrees: [] }
            : { ok: true }) as never,
      ),
    )
    shell.newThread()
    shell.handleKey({ key: 'b' })

    for (const key of 'fix/a') shell.handleKey({ key })
    expect(branchField.branch).toBe('fix/a')
    shell.handleKey({ key: 'Enter' })
    await drain()

    expect(branchField.columnId).toBeNull()
    const ids = app.workspace.threads.map((thread) => thread.id)
    expect(ids).toEqual(['t1', 'made'])
    expect(app.workspace.threads[1].branch).toBe('fix/a')
  })

  it('refuses a taken name under the field, before git is asked', async () => {
    catalog.workspaces = [{ ...structuredClone(WORKSPACE), git: { branch: 'main' } as never }]
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      Promise.resolve(
        (name === 'listWorktrees' ? { worktrees: [{ branch: 'fix/a' }] } : { ok: true }) as never,
      ),
    )
    shell.newThread()
    shell.handleKey({ key: 'b' })
    await drain()

    for (const key of 'fix/a') shell.handleKey({ key })

    expect(branchField.problem).toBe('that branch already exists')
    expect(branchField.ready).toBe(false)
    branchField.close()
  })

  it('goes back to the menu on esc, keeping the column', () => {
    catalog.workspaces = [{ ...structuredClone(WORKSPACE), git: { branch: 'main' } as never }]
    shell.newThread()
    shell.handleKey({ key: 'b' })
    shell.handleKey({ key: 'x' })

    shell.handleKey({ key: 'Escape' })

    expect(branchField.columnId).toBeNull()
    expect(app.thread.fresh).toBe(true)
  })

  it('keeps the field up with the failure when git refuses', async () => {
    catalog.workspaces = [{ ...structuredClone(WORKSPACE), git: { branch: 'main' } as never }]
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      name === 'createThread'
        ? Promise.reject(new Error('worktree add failed'))
        : Promise.resolve((name === 'listWorktrees' ? { worktrees: [] } : { ok: true }) as never),
    )
    shell.newThread()
    shell.handleKey({ key: 'b' })
    for (const key of 'fix/a') shell.handleKey({ key })

    shell.handleKey({ key: 'Enter' })
    await drain()

    expect(branchField.columnId).not.toBeNull()
    expect(branchField.failure).toBe('git would not make that worktree')
    expect(app.thread.fresh).toBe(true)
    branchField.close()
  })
})

describe('a branch field whose column vanished', () => {
  it('lets go of the keyboard instead of eating every key', () => {
    catalog.workspaces = [{ ...structuredClone(WORKSPACE), git: { branch: 'main' } as never }]
    shell.newThread()
    shell.handleKey({ key: 'b' })
    expect(branchField.columnId).not.toBeNull()

    // A catalog reload rebuilds the strip without dashboards.
    catalog.workspaces = [structuredClone(WORKSPACE)]

    // The next key is not swallowed: it reaches the strip and acts.
    shell.handleKey({ key: 'l' })

    expect(branchField.columnId).toBeNull()
    expect(app.focus[0]).toBe(1)
    app.focusThread(0)
  })
})
