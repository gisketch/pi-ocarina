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
