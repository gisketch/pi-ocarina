import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', () => ({
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
    git: { refresh: () => {}, statuses: () => Promise.resolve([]), onStatus: () => () => {} },
    terminal: { onData: () => () => {} },
  },
  isDesktop: true,
}))

import { actionsFor, blockMenu } from './block-menu.svelte'
import { catalog } from './catalog.svelte'
import { threads } from './threads.svelte'
import { navBlocks } from '../blocks'
import type { Block } from '../thread'

const blocks: Block[] = [
  { kind: 'checkpoint', id: 'e1', label: 'hello' },
  { kind: 'user', id: 'user:e1', text: 'hello' },
  { kind: 'agent', id: 'a1', text: 'sure' },
]
const [message, reply] = navBlocks(blocks)

describe('actionsFor', () => {
  it('offers restore only where there is something to rewind to', () => {
    expect(actionsFor(message, true).map((a) => a.id)).toEqual(['copy', 'restore'])
    expect(actionsFor(reply, true).map((a) => a.id)).toEqual(['copy'])
  })

  it('offers no restore against a thread the backend never had', () => {
    expect(actionsFor(message, false).map((a) => a.id)).toEqual(['copy'])
  })
})

describe('the menu', () => {
  beforeEach(() => {
    blockMenu.close()
    catalog.source = 'live'
  })

  it('opens on the block it was given, at the first action', () => {
    blockMenu.openOn('t1', message)

    expect(blockMenu.open).toBe(true)
    expect(blockMenu.index).toBe(0)
    expect(blockMenu.confirming).toBe(false)
  })

  it('moves the highlight with j and k, and clamps', () => {
    blockMenu.openOn('t1', message)

    blockMenu.handleKey({ key: 'j' })
    expect(blockMenu.index).toBe(1)
    blockMenu.handleKey({ key: 'j' })
    expect(blockMenu.index).toBe(1)
    blockMenu.handleKey({ key: 'k' })
    blockMenu.handleKey({ key: 'k' })
    expect(blockMenu.index).toBe(0)
  })

  it('closes on escape', () => {
    blockMenu.openOn('t1', message)
    blockMenu.handleKey({ key: 'Escape' })

    expect(blockMenu.open).toBe(false)
  })

  it('swallows every other key rather than letting it move the column', () => {
    blockMenu.openOn('t1', message)

    expect(blockMenu.handleKey({ key: 'l' })).toBe(true)
    expect(blockMenu.open).toBe(true)
  })

  it('copies and closes in one press', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    blockMenu.openOn('t1', message)
    blockMenu.handleKey({ key: 'Enter' })

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(blockMenu.open).toBe(false)
    vi.unstubAllGlobals()
  })

  it('asks before it restores, and only rewinds on the second press', () => {
    const restore = vi.spyOn(threads, 'restore').mockImplementation(() => {})

    blockMenu.openOn('t1', message)
    blockMenu.handleKey({ key: 'j' })
    blockMenu.handleKey({ key: 'Enter' })

    expect(blockMenu.confirming).toBe(true)
    expect(restore).not.toHaveBeenCalled()

    blockMenu.handleKey({ key: 'Enter' })

    expect(restore).toHaveBeenCalledWith('t1', 'e1')
    expect(blockMenu.open).toBe(false)
    restore.mockRestore()
  })

  it('takes back the question on escape without closing the menu', () => {
    blockMenu.openOn('t1', message)
    blockMenu.handleKey({ key: 'j' })
    blockMenu.handleKey({ key: 'Enter' })

    blockMenu.handleKey({ key: 'Escape' })

    expect(blockMenu.confirming).toBe(false)
    expect(blockMenu.open).toBe(true)
  })

  it('takes back the question when the highlight moves off it', () => {
    const restore = vi.spyOn(threads, 'restore').mockImplementation(() => {})

    blockMenu.openOn('t1', message)
    blockMenu.handleKey({ key: 'j' })
    blockMenu.handleKey({ key: 'Enter' })
    blockMenu.handleKey({ key: 'k' })
    // Back on `restore`, but the question was withdrawn: a press here must ask
    // again rather than complete a restore the reader stepped away from.
    blockMenu.handleKey({ key: 'j' })
    blockMenu.handleKey({ key: 'Enter' })

    expect(restore).not.toHaveBeenCalled()
    expect(blockMenu.confirming).toBe(true)
    restore.mockRestore()
  })
})
