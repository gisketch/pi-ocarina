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
import { leap } from './leap.svelte'
import { blockFocus, registerBlock } from './block-focus.svelte'

/** Stands in for a rendered row: the drop-stale check asks whether one was
 *  ever drawn, and in a headless run nothing is. */
function stubElement(): HTMLElement {
  return {
    scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, bottom: 10 }) as DOMRect,
  } as unknown as HTMLElement
}

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

describe('a leap over the dashboard', () => {
  it('lands on a recent row as a selection, not a ring, and stays NORMAL', async () => {
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      Promise.resolve(
        (name === 'listThreads'
          ? {
              threads: [
                { id: 'mid', title: 'yesterday', modified: '2026-08-18T00:00:00Z', messageCount: 2 },
                { id: 'new', title: 'this morning', modified: '2026-08-19T00:00:00Z', messageCount: 9 },
              ],
            }
          : { ok: true }) as never,
      ),
    )
    await dashboardRecent.load('w1')
    shell.newThread()
    const columnId = app.thread.id

    // The landing refuses a row nothing drew, so one has to have been.
    const off = registerBlock(columnId, 'mid', stubElement())
    leap.threadId = columnId
    leap.typed = 'ye'
    leap.targets = [{ navId: 'mid', top: 0, left: 0 }]

    shell.handleKey({ key: 's' })
    off()

    expect(leap.active).toBe(false)
    expect(app.mode).toBe('NORMAL')
    expect(blockFocus.idOf(columnId)).toBeNull()
    expect(dashboardRecent.selected('w1')).toBe(1)
    expect(app.thread.fresh).toBe(true)
  })
})

describe('the thread picker', () => {
  it('opens on / only from the dashboard; elsewhere / is content search', () => {
    shell.handleKey({ key: '/' })
    expect(shell.overlay).toBe('search')
    shell.handleKey({ key: 'Escape' })

    shell.newThread()
    shell.handleKey({ key: '/' })
    expect(shell.overlay).toBe('threads')
    shell.handleKey({ key: 'Escape' })
    expect(shell.overlay).toBeNull()
  })

  it('lists the whole history, not just five', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `h${i}`,
      title: `thread ${i}`,
      modified: `2026-08-0${i + 1}T00:00:00Z`,
      messageCount: 1,
    }))
    vi.spyOn(session, 'invoke').mockImplementation((name: CommandName) =>
      Promise.resolve((name === 'listThreads' ? { threads: many } : { ok: true }) as never),
    )
    await dashboardRecent.load('w1')

    expect(dashboardRecent.rows('w1')).toHaveLength(5)
    expect(dashboardRecent.all('w1')).toHaveLength(9)
    expect(dashboardRecent.all('w1')[0].id).toBe('h8')
  })
})
