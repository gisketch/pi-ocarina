import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', async () => (await import('./fixtures')).BRIDGE_MOCK)

import { app } from './app.svelte'
import { WORKSPACE } from './fixtures'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'
import { blockFocus, registerBlock } from './block-focus.svelte'
import { blockMenu } from './block-menu.svelte'
import { toolOpen } from './tool-open.svelte'
import { threads } from './threads.svelte'
import { navBlocks } from '../blocks'
import type { Block } from '../thread'


/** Stands in for a rendered block: the drop-stale check asks whether one was
 *  ever drawn, and in a headless run nothing is. */
function stubElement(): HTMLElement {
  return { scrollIntoView() {}, getBoundingClientRect: () => ({ top: 0, bottom: 10 }) as DOMRect } as unknown as HTMLElement
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

    // Keyed by nav id: a tool call id is only unique within its own call.
    shell.handleKey({ key: 'l' })
    expect(toolOpen.isOpen('s1', 'l1:r1', false)).toBe(true)

    shell.handleKey({ key: 'h' })
    expect(toolOpen.isOpen('s1', 'l1:r1', false)).toBe(false)
  })

  it('does not leave the mode behind when the focus moves to another column', () => {
    shell.handleKey({ key: 'j' })
    expect(app.mode).toBe('READ')

    // A leader chord moves the column without going near the transcript keys.
    shell.handleKey({ key: ' ' })
    shell.handleKey({ key: 'l' })

    expect(app.focus[0]).toBe(1)
    expect(app.mode).toBe('NORMAL')
    app.focusThread(0)
  })

  it('clears a stranded ring on esc, whatever mode it was left in', () => {
    shell.handleKey({ key: 'j' })
    app.mode = 'NORMAL'

    shell.handleKey({ key: 'Escape' })

    expect(blockFocus.idOf('s1')).toBeNull()
  })

  it('keeps the ring while esc is busy closing an overlay', () => {
    shell.handleKey({ key: 'j' })
    shell.handleKey({ key: '?' })
    expect(shell.overlay).toBe('keymap')

    shell.handleKey({ key: 'Escape' })
    expect(shell.overlay).toBeNull()
    expect(blockFocus.idOf('s1')).toBe('u1')

    shell.handleKey({ key: 'Escape' })
    expect(blockFocus.idOf('s1')).toBeNull()
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

  it('drops a menu on a block that is no longer drawn', () => {
    // A compaction folds the blocks above it out of the rendered list while
    // leaving them in the model. The menu would stay modal over nothing.
    const block = navBlocks([{ kind: 'user', id: 'u1', text: 'hello' }])[0]
    const off = registerBlock('s1', 'u1', stubElement())
    blockMenu.openOn('s1', block)

    shell.handleKey({ key: 'j' })
    expect(blockMenu.open).toBe(true)

    off()
    shell.handleKey({ key: 'j' })
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
