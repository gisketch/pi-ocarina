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
import { terminals } from './terminal.svelte'
import { terminalId } from '../types'

const WORKSPACE = {
  id: 'w1',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  branch: '',
  git: '',
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

describe('opening the terminal column', () => {
  it('creates it once, focuses it, and lands in TERM ready to type', () => {
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()

    shell.openTerminal()

    expect(create).toHaveBeenCalledWith('w1')
    expect(app.thread.id).toBe(TERM_ID)
    expect(app.thread.terminal).toBe(true)
    expect(app.mode).toBe('TERM')
  })

  it('jumps to the shell that is already there rather than making a second', () => {
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()
    shell.openTerminal()
    app.focusThread(0)
    app.mode = 'NORMAL'
    create.mockClear()

    shell.openTerminal()

    expect(create).not.toHaveBeenCalled()
    expect(app.workspace.threads.filter((thread) => thread.terminal)).toHaveLength(1)
    expect(app.thread.id).toBe(TERM_ID)
    expect(app.mode).toBe('TERM')
  })

  it('does nothing without a live workspace to run a shell in', () => {
    catalog.source = 'empty'
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()

    shell.openTerminal()

    expect(create).not.toHaveBeenCalled()
  })
})

describe('leaving TERM', () => {
  beforeEach(() => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    shell.openTerminal()
  })

  it('sends nothing to the pty on a single escape', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(1000)

    shell.termEscape()

    expect(write).not.toHaveBeenCalled()
  })

  it('sends a literal escape when the second one lands inside the window', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    shell.termEscape()

    now.mockReturnValue(1100)
    shell.termEscape()

    expect(write).toHaveBeenCalledWith('w1', ESC)
    expect(app.mode).toBe('TERM')
  })

  it('treats a late second escape as a fresh one, not half a chord', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    shell.termEscape()

    now.mockReturnValue(9000)
    shell.termEscape()

    expect(write).not.toHaveBeenCalled()
  })
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
    shell.openTerminal()

    shell.moveColumn(-1)

    expect(app.workspace.threads.map((thread) => thread.id)).toEqual(['s1', TERM_ID, 's2'])
  })
})

describe('closing the terminal column', () => {
  beforeEach(() => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    shell.openTerminal()
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
    shell.openTerminal()
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
