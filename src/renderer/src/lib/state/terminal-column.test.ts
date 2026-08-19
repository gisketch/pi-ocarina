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

const TERM_ID = terminalId('w1', 's1')
/** What a real escape key sends. */
const ESC = String.fromCharCode(27)
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.restoreAllMocks()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'OCARINA'
  shell.pendingClose = null
})

describe('opening the terminal column', () => {
  it('creates it once, focuses it, and lands in TERM ready to type', () => {
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()

    termMode.open()

    expect(create).toHaveBeenCalledWith(TERM_ID, 'w1')
    expect(app.thread.id).toBe(TERM_ID)
    expect(app.thread.terminal).toBe(true)
    expect(app.mode).toBe('TERM')
  })

  it('jumps to the shell that is already there rather than making a second', () => {
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
    app.focusThread(0)
    app.mode = 'OCARINA'
    create.mockClear()

    termMode.open()

    expect(app.workspace.threads.filter((thread) => thread.terminal)).toHaveLength(1)
    expect(app.thread.id).toBe(TERM_ID)
    expect(app.mode).toBe('TERM')
  })

  it('creates independent terminals for two hosts', () => {
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
    app.focusThread(app.workspace.threads.findIndex((thread) => thread.id === 's2'))

    termMode.open()

    const shells = app.workspace.threads.filter((thread) => thread.terminal)
    expect(shells).toHaveLength(2)
    expect(shells.map((thread) => thread.attachment?.hostId)).toEqual(['s1', 's2'])
    expect(create).toHaveBeenLastCalledWith(terminalId('w1', 's2'), 'w1')
  })

  it('revives a shell the user exited, without closing the column first', () => {
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
    app.mode = 'OCARINA'
    create.mockClear()

    // The column outlives its pty; `create` is a no-op while one is running.
    termMode.open()

    expect(create).toHaveBeenCalledWith(TERM_ID, 'w1')
    expect(app.workspace.threads.filter((thread) => thread.terminal)).toHaveLength(1)
  })

  it('does nothing without a live workspace to run a shell in', () => {
    catalog.source = 'empty'
    const create = vi.spyOn(terminals, 'create').mockResolvedValue()

    termMode.open()

    expect(create).not.toHaveBeenCalled()
  })
})

describe('leaving TERM', () => {
  beforeEach(() => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
  })

  it('sends nothing to the pty on a single escape', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(1000)

    termMode.escape()

    expect(write).not.toHaveBeenCalled()
  })

  it('sends a literal escape when the second one lands inside the window', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    termMode.escape()

    now.mockReturnValue(1100)
    termMode.escape()

    expect(write).toHaveBeenCalledWith(TERM_ID, ESC)
    expect(app.mode).toBe('TERM')
  })

  it('treats a late second escape as a fresh one, not half a chord', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    termMode.escape()

    now.mockReturnValue(9000)
    termMode.escape()

    expect(write).not.toHaveBeenCalled()
  })
})

describe('esc esc through the real key path', () => {
  // The chord has to survive the whole machine: the first press leaves TERM,
  // so the second one arrives in NORMAL and would never reach the TERM branch.
  beforeEach(() => {
    vi.spyOn(terminals, 'create').mockResolvedValue()
    termMode.open()
  })

  it('sends a literal escape on two presses inside the window', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')

    now.mockReturnValue(1000)
    shell.handleKey({ key: 'Escape' })
    expect(app.mode).toBe('OCARINA')

    now.mockReturnValue(1100)
    shell.handleKey({ key: 'Escape' })

    expect(write).toHaveBeenCalledWith(TERM_ID, ESC)
    expect(app.mode).toBe('TERM')
  })

  it('sends nothing when the second press is late', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')

    now.mockReturnValue(1000)
    shell.handleKey({ key: 'Escape' })
    now.mockReturnValue(9000)
    shell.handleKey({ key: 'Escape' })

    expect(write).not.toHaveBeenCalled()
    expect(app.mode).toBe('OCARINA')
  })

  it('does not fire on a thread column, however fast the presses', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    shell.handleKey({ key: 'Escape' })
    app.focusThread(0)

    now.mockReturnValue(1050)
    shell.handleKey({ key: 'Escape' })

    expect(write).not.toHaveBeenCalled()
  })

  it('re-arms on entering TERM, so a lone escape stays a lone escape', () => {
    const write = vi.spyOn(terminals, 'write').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')

    now.mockReturnValue(1000)
    shell.handleKey({ key: 'Escape' })
    now.mockReturnValue(1100)
    shell.handleKey({ key: 'i' })
    now.mockReturnValue(1150)
    shell.handleKey({ key: 'Escape' })

    expect(write).not.toHaveBeenCalled()
  })
})
