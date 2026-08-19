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
import { dashboardRecent } from './dashboard-recent.svelte'

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
  it('adds a dashboard column and creates nothing in the backend', () => {
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ threads: [] } as never)

    shell.newThread()

    const threads = app.workspace.threads
    expect(threads).toHaveLength(2)
    expect(threads[1].fresh).toBe(true)
    expect(app.threadIndex).toBe(1)
    expect(app.mode).toBe('NORMAL')
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

describe('the recent list', () => {
  const summaries = [
    { id: 'old', title: 'older work', modified: '2026-08-10T00:00:00Z', messageCount: 4 },
    { id: 'mid', title: 'yesterday', modified: '2026-08-18T00:00:00Z', messageCount: 2 },
    { id: 'new', title: 'this morning', modified: '2026-08-19T00:00:00Z', messageCount: 9 },
    { id: 't1', title: 'first', modified: '2026-08-19T01:00:00Z', messageCount: 1 },
    { id: 'a', title: 'a', modified: '2026-08-01T00:00:00Z', messageCount: 1 },
    { id: 'b', title: 'b', modified: '2026-08-02T00:00:00Z', messageCount: 1 },
    { id: 'c', title: 'c', modified: '2026-08-03T00:00:00Z', messageCount: 1 },
  ]

  function listing(): void {
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      Promise.resolve(
        (name === 'listThreads'
          ? { threads: summaries }
          : name === 'unarchiveThread'
            ? { ok: true }
            : { ok: true }) as never,
      ),
    )
  }

  async function drain(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('shows the five newest closed threads, never one that is open', async () => {
    listing()
    await dashboardRecent.load('w1')

    const rows = dashboardRecent.rows('w1')

    // `t1` is open on the strip, so six candidates remain and five fit.
    expect(rows.map((row) => row.id)).toEqual(['new', 'mid', 'old', 'c', 'b'])
  })

  it('walks the bar with j/k inside the rows, never past an end', async () => {
    listing()
    await dashboardRecent.load('w1')
    shell.newThread()

    shell.handleKey({ key: 'k' })
    expect(dashboardRecent.selected('w1')).toBe(0)
    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'j' })
    expect(dashboardRecent.selected('w1')).toBe(2)
    for (let i = 0; i < 9; i += 1) shell.handleKey({ key: 'j' })
    expect(dashboardRecent.selected('w1')).toBe(4)
    expect(app.mode).toBe('NORMAL')
  })

  it('opens the picked row in the dashboard column itself', async () => {
    listing()
    await dashboardRecent.load('w1')
    shell.newThread()
    catalog.openTerminal('w1')

    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'Enter' })
    await drain()

    const ids = app.workspace.threads.map((thread) => thread.id)
    expect(ids).toEqual(['t1', 'mid', 'terminal:w1'])
    expect(app.thread.id).toBe('mid')
  })

})
