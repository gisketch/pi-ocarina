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
import { shell } from './shell.svelte'
import { blockFocus } from './block-focus.svelte'
import { blockMenu } from './block-menu.svelte'
import { toolOpen } from './tool-open.svelte'
import { threads } from './threads.svelte'
import { navBlocks } from '../blocks'
import type { Block } from '../thread'

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

beforeEach(() => {
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'NORMAL'
  shell.pendingClose = null
  blockFocus.cancelLeap()
  blockFocus.forget('s1')
  blockFocus.forget('s2')
  blockMenu.close()
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


// READ is a mode, and the point of the mode is what it refuses: h and l must
// not reach the strip while a reader is walking a conversation.
describe('READ through the real key path', () => {
  const blocks: Block[] = [
    { kind: 'user', id: 'u1', text: 'hello' },
    {
      kind: 'ledger',
      id: 'l1',
      rows: [{ id: 'r1', kind: 'read', target: 'a.ts', status: 'ok', body: { type: 'code', lines: [] } }],
    },
  ]

  beforeEach(() => {
    threads.seed('s1', { blocks, status: 'idle', runState: 'idle' })
    toolOpen.forget('s1')
    app.mode = 'NORMAL'
  })

  it('is entered by j, and left by esc', () => {
    shell.handleKey({ key: 'j' })
    expect(app.mode).toBe('READ')

    shell.handleKey({ key: 'Escape' })
    expect(app.mode).toBe('NORMAL')
    expect(blockFocus.idOf('s1')).toBeNull()
  })

  it('does not move to another column on h or l', () => {
    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'l' })
    shell.handleKey({ key: 'l' })

    expect(app.focus[0]).toBe(0)
    expect(app.mode).toBe('READ')
  })

  it('moves columns again once esc has been pressed', () => {
    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'Escape' })
    shell.handleKey({ key: 'l' })

    expect(app.focus[0]).toBe(1)
    app.focusThread(0)
  })

  it('opens and closes the focused tool row with l and h', () => {
    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: 'j' })
    expect(blockFocus.idOf('s1')).toBe('l1:r1')

    shell.handleKey({ key: 'l' })
    expect(toolOpen.isOpen('s1', 'r1', false)).toBe(true)

    shell.handleKey({ key: 'h' })
    expect(toolOpen.isOpen('s1', 'r1', false)).toBe(false)
  })

  it('does nothing to a message, which has nothing to widen', () => {
    shell.handleKey({ key: 'j' })
    expect(blockFocus.idOf('s1')).toBe('u1')

    expect(shell.handleKey({ key: 'l' })).toBe(true)
    expect(app.focus[0]).toBe(0)
  })
})

// A modal surface that outlives what it points at swallows every key from
// behind something that is no longer drawn.
describe('overlays that lose their block', () => {
  beforeEach(() => {
    threads.seed('s1', {
      blocks: [{ kind: 'user', id: 'u1', text: 'hello' }],
      status: 'idle',
      runState: 'idle',
    })
  })

  it('drops a menu whose block the thread no longer holds', () => {
    blockMenu.openOn('s1', navBlocks([{ kind: 'user', id: 'gone', text: 'x' }])[0])

    shell.handleKey({ key: 'l' })

    expect(blockMenu.open).toBe(false)
  })

  it('drops a menu left behind on another column', () => {
    blockMenu.openOn('s2', navBlocks([{ kind: 'user', id: 'u1', text: 'hello' }])[0])

    shell.handleKey({ key: 'l' })

    expect(blockMenu.open).toBe(false)
    app.focusThread(0)
  })

  it('cancels hints left behind on another column', () => {
    blockFocus.leap = { threadId: 's2', ids: ['u1'], labels: ['a'], typed: '' }

    shell.handleKey({ key: 'l' })

    expect(blockFocus.leap).toBeNull()
    app.focusThread(0)
  })

  it('forgets a closed thread rather than keeping its ring forever', () => {
    blockFocus.set('s2', 'u1')

    shell.closeThread('s2', { cancelTurn: false })

    expect(blockFocus.idOf('s2')).toBeNull()
  })
})
