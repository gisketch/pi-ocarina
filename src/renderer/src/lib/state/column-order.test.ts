// Arranging columns: moving them, and remembering where they were put.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
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

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'
import { termMode } from './term-mode.svelte'
import { terminals } from './terminal.svelte'
import { terminalId } from '../types'

const WORKSPACE = {
  id: 'w1',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  git: null,
  snippet: '/code/pi-core',
  threads: [
    { id: 's1', title: 'first', status: 'idle' as const, meta: '' },
    { id: 's2', title: 'second', status: 'idle' as const, meta: '' },
  ],
}

const TERM_ID = terminalId('w1')
/** What a real escape key sends. */
const ESC = String.fromCharCode(27)
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'NORMAL'
  shell.pendingClose = null
})

describe('moving columns', () => {
  it('swaps the focused column with its neighbour and follows it', () => {
    app.focusThread(0)

    shell.moveColumn(1)

    expect(app.workspace.threads.map((thread) => thread.id)).toEqual(['s2', 's1'])
    expect(app.threadIndex).toBe(1)
    expect(app.thread.id).toBe('s1')
  })

  it('refuses to move a column off either end', () => {
    app.focusThread(0)
    shell.moveColumn(-1)
    expect(app.workspace.threads.map((thread) => thread.id)).toEqual(['s1', 's2'])

    app.focusThread(1)
    shell.moveColumn(1)
    expect(app.workspace.threads.map((thread) => thread.id)).toEqual(['s1', 's2'])
  })

  it('moves the terminal like any other column', () => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()

    shell.moveColumn(-1)

    expect(app.workspace.threads.map((thread) => thread.id)).toEqual(['s1', TERM_ID, 's2'])
  })
})

describe('closing the terminal column', () => {
  beforeEach(() => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
    app.mode = 'NORMAL'
  })

  it('kills the shell and takes the column away when nothing is running', async () => {
    vi.spyOn(terminals, 'busy').mockResolvedValue(false)
    const kill = vi.spyOn(terminals, 'kill').mockImplementation(() => {})

    shell.requestClose()
    await settle()

    expect(kill).toHaveBeenCalledWith('w1')
    expect(app.workspace.threads.some((thread) => thread.terminal)).toBe(false)
    expect(shell.pendingClose).toBeNull()
  })

  it('asks first when a command is still running', async () => {
    vi.spyOn(terminals, 'busy').mockResolvedValue(true)
    const kill = vi.spyOn(terminals, 'kill').mockImplementation(() => {})

    shell.requestClose()
    await settle()

    expect(shell.pendingClose).toBe(TERM_ID)
    expect(kill).not.toHaveBeenCalled()
  })

  it('does not archive the shell, which has no history to hide', async () => {
    vi.spyOn(terminals, 'busy').mockResolvedValue(false)
    vi.spyOn(terminals, 'kill').mockImplementation(() => {})
    const archive = vi.spyOn(catalog, 'closeThread')

    shell.requestClose()
    await settle()

    expect(archive).not.toHaveBeenCalled()
  })
})

describe('when the shell cannot start', () => {
  it('takes the column back and says why, rather than sitting blank', async () => {
    // The documented native-module failure: without this the user gets an
    // empty column in TERM and an unhandled rejection nobody sees.
    vi.spyOn(terminals, 'create').mockRejectedValue(new Error('node-pty ABI mismatch'))

    termMode.open()
    await settle()

    expect(app.workspace.threads.some((thread) => thread.terminal)).toBe(false)
    expect(catalog.error).toBe('node-pty ABI mismatch')
    expect(app.mode).toBe('NORMAL')
  })
})

describe('closing the shell named by the column', () => {
  it('kills that workspace’s shell even if focus moved while it was asked', async () => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
    const kill = vi.spyOn(terminals, 'kill').mockImplementation(() => {})

    // The id carries the workspace, so a focus change cannot redirect the kill.
    shell.closeThread(terminalId('w1'), { cancelTurn: false })

    expect(kill).toHaveBeenCalledWith('w1')
  })
})

describe('remembered column order', () => {
  it('restores what the user arranged', () => {
    catalog.applyOrder({ w1: ['s2', 's1'] })

    expect(catalog.workspaces[0].threads.map((thread) => thread.id)).toEqual(['s2', 's1'])
  })

  it('keeps a column the stored order never heard of', () => {
    // A thread created since the last save must still appear rather than being
    // dropped by an order that predates it.
    catalog.applyOrder({ w1: ['s2'] })

    expect(catalog.workspaces[0].threads.map((thread) => thread.id)).toEqual(['s2', 's1'])
  })

  it('ignores an order naming columns that are gone', () => {
    catalog.applyOrder({ w1: ['ghost', 's2'] })

    expect(catalog.workspaces[0].threads.map((thread) => thread.id)).toEqual(['s2', 's1'])
  })
})

describe('typing at a focused shell', () => {
  it('sends `i` to TERM rather than to a composer that is not there', () => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
    app.mode = 'NORMAL'
    const focus = vi.spyOn(shell, 'focusComposer').mockImplementation(() => {})

    shell.handleKey({ key: 'i' })

    expect(app.mode).toBe('TERM')
    expect(focus).not.toHaveBeenCalled()
  })

  it('still focuses the composer on a thread column', () => {
    app.focusThread(0)
    const focus = vi.spyOn(shell, 'focusComposer').mockImplementation(() => {})

    shell.handleKey({ key: 'i' })

    expect(app.mode).toBe('INSERT')
    expect(focus).toHaveBeenCalled()
  })
})
