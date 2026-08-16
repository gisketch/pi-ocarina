import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
    git: {
      refresh: () => {},
      statuses: () => Promise.resolve([]),
      onStatus: () => () => {},
      changes: () => Promise.resolve({ changes: [], message: '' }),
      commit: () => Promise.resolve({ ok: true, pushed: false }),
      push: () => Promise.resolve({ ok: true, pushed: true }),
    },
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
import { commit } from './commit.svelte'
import { confirm } from './confirm.svelte'
import { shell } from './shell.svelte'
import { blockFocus, registerBlock } from './block-focus.svelte'
import { blockMenu } from './block-menu.svelte'
import { navBlocks } from '../blocks'
import { threads } from './threads.svelte'
import { registerColumnBody } from './columns'

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

const QUESTION = { title: 'quit', message: 'work is running', confirmLabel: 'quit' }

beforeEach(() => {
  confirm.answer(false)
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'NORMAL'
  shell.pendingClose = null
  commit.close()
  blockFocus.cancelLeap()
  blockFocus.clear('s1')
  blockMenu.close()
})

/** Puts one labelled block on screen in the focused thread. */
function drawOneBlock(): () => void {
  const rect = { top: 0, bottom: 100 } as DOMRect
  const body = {
    scrollTop: 0,
    clientHeight: 400,
    getBoundingClientRect: () => ({ top: 0, bottom: 400 }) as DOMRect,
    scrollBy() {},
  }
  const el = { getBoundingClientRect: () => rect, scrollIntoView() {} }

  const offBody = registerColumnBody('s1', body as unknown as HTMLElement)
  const offBlock = registerBlock('s1', 'b1', el as unknown as HTMLElement)
  blockFocus.leap = { threadId: 's1', ids: ['b1'], labels: ['a'], typed: '' }

  return () => {
    offBlock()
    offBody()
  }
}

// The question has to survive the whole machine, not just its own state: a
// modal that the shell never consults is a modal the keyboard walks straight
// past.
describe('the destructive modal through the real key path', () => {
  it('swallows a key that would otherwise move the focus', () => {
    void confirm.ask(QUESTION)

    expect(shell.handleKey({ key: 'l' })).toBe(true)

    expect(app.focus[0]).toBe(0)
    expect(confirm.pending).toBe(true)
  })

  it('answers yes on enter', async () => {
    const answered = confirm.ask(QUESTION)

    shell.handleKey({ key: 'Enter' })

    await expect(answered).resolves.toBe(true)
  })

  it('answers no on escape, without also leaving a mode', async () => {
    app.mode = 'INSERT'
    const answered = confirm.ask(QUESTION)

    shell.handleKey({ key: 'Escape' })

    await expect(answered).resolves.toBe(false)
    // The escape answered the question; it must not have escaped the composer
    // underneath it as well.
    expect(app.mode).toBe('INSERT')
  })

  it('outranks the close confirm rather than letting both read the key', async () => {
    shell.pendingClose = 's1'
    const answered = confirm.ask(QUESTION)

    shell.handleKey({ key: 'y' })

    expect(shell.pendingClose).toBe('s1')
    confirm.answer(false)
    await expect(answered).resolves.toBe(false)
  })
})

describe('the commit card through the real key path', () => {
  it('swallows a key that would otherwise move the focus', async () => {
    await commit.load()

    expect(shell.handleKey({ key: 'l' })).toBe(true)
    expect(app.focus[0]).toBe(0)
    expect(commit.open).toBe(true)
  })

  it('closes on escape', async () => {
    await commit.load()

    shell.handleKey({ key: 'Escape' })

    expect(commit.open).toBe(false)
  })

  it('yields to the destructive modal, which outranks it', async () => {
    await commit.load()
    void confirm.ask(QUESTION)

    shell.handleKey({ key: 'Escape' })

    expect(confirm.pending).toBe(false)
    expect(commit.open).toBe(true)
  })
})


// Hints own every key while they are up — that is what lets a label be `j`.
// The rank matters in both directions: below the modals, above navigation.
describe('the hint mode through the real key path', () => {
  it('swallows a key that would otherwise move the focus', () => {
    const release = drawOneBlock()

    expect(shell.handleKey({ key: 'l' })).toBe(true)
    expect(app.focus[0]).toBe(0)
    release()
  })

  it('takes the label and leaves', () => {
    const release = drawOneBlock()

    shell.handleKey({ key: 'a' })

    expect(blockFocus.leap).toBeNull()
    expect(blockFocus.idOf('s1')).toBe('b1')
    release()
  })

  it('cancels on escape without moving the ring', () => {
    const release = drawOneBlock()

    shell.handleKey({ key: 'Escape' })

    expect(blockFocus.leap).toBeNull()
    expect(blockFocus.idOf('s1')).toBeNull()
    release()
  })

  it('is not dismissed by reaching for a modifier', () => {
    const release = drawOneBlock()

    expect(shell.handleKey({ key: 'Shift' })).toBe(false)
    expect(blockFocus.leap).not.toBeNull()
    release()
  })

  it('yields to the destructive modal, which outranks it', () => {
    const release = drawOneBlock()
    void confirm.ask(QUESTION)

    shell.handleKey({ key: 'Escape' })

    expect(confirm.pending).toBe(false)
    expect(blockFocus.leap).not.toBeNull()
    release()
  })

  it('yields to the commit card as well', async () => {
    const release = drawOneBlock()
    await commit.load()

    shell.handleKey({ key: 'Escape' })

    expect(commit.open).toBe(false)
    expect(blockFocus.leap).not.toBeNull()
    release()
  })
})


// The menu is modal, and its rank is the whole point: below the two questions
// that are asked because work is in flight, above the hints that are not.
describe('the block menu through the real key path', () => {
  const block = navBlocks([{ kind: 'user', id: 'u1', text: 'hello' }])[0]

  it('swallows a key that would otherwise move the focus', () => {
    blockMenu.openOn('s1', block)

    expect(shell.handleKey({ key: 'l' })).toBe(true)
    expect(app.focus[0]).toBe(0)
    expect(blockMenu.open).toBe(true)
  })

  it('lets a bare modifier through rather than reading it as a choice', () => {
    blockMenu.openOn('s1', block)

    expect(shell.handleKey({ key: 'Shift' })).toBe(false)
    expect(blockMenu.open).toBe(true)
  })

  it('closes on escape', () => {
    blockMenu.openOn('s1', block)

    shell.handleKey({ key: 'Escape' })

    expect(blockMenu.open).toBe(false)
  })

  it('yields to the destructive modal, which outranks it', () => {
    blockMenu.openOn('s1', block)
    void confirm.ask(QUESTION)

    shell.handleKey({ key: 'Escape' })

    expect(confirm.pending).toBe(false)
    expect(blockMenu.open).toBe(true)
  })

  it('outranks the hint mode, which is not modal', () => {
    blockMenu.openOn('s1', block)
    blockFocus.leap = { threadId: 's1', ids: ['u1'], labels: ['a'], typed: '' }

    shell.handleKey({ key: 'Escape' })

    expect(blockMenu.open).toBe(false)
    expect(blockFocus.leap).not.toBeNull()
  })
})


// The state modules can all be right while nothing reaches them. This drives
// the real key path and asserts on the ring itself, which is the seam the
// per-module tests step over.
describe('the transcript through the real key path', () => {
  beforeEach(() => {
    threads.seed('s1', {
      blocks: [
        { kind: 'user', id: 'u1', text: 'hello' },
        { kind: 'agent', id: 'a1', text: 'sure' },
      ],
      status: 'idle',
      runState: 'idle',
    })
  })

  it('moves the ring on j and k', () => {
    shell.handleKey({ key: 'j' })
    expect(blockFocus.idOf('s1')).toBe('u1')

    shell.handleKey({ key: 'j' })
    expect(blockFocus.idOf('s1')).toBe('a1')

    shell.handleKey({ key: 'k' })
    expect(blockFocus.idOf('s1')).toBe('u1')
  })

  it('releases the ring on escape', () => {
    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'Escape' })

    expect(blockFocus.idOf('s1')).toBeNull()
  })

  it('opens the menu on a with the focused block, and does nothing without one', () => {
    shell.handleKey({ key: 'a' })
    expect(blockMenu.open).toBe(false)

    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'a' })

    expect(blockMenu.open).toBe(true)
    expect(blockMenu.block?.id).toBe('u1')
    expect(blockMenu.threadId).toBe('s1')
  })

  it('gives the transcript back its plain look when the composer takes the caret', () => {
    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'i' })

    expect(blockFocus.idOf('s1')).toBeNull()
    app.mode = 'NORMAL'
  })
})
