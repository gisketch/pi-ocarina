import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../bridge', async () => (await import('./fixtures')).BRIDGE_MOCK)

import { app } from './app.svelte'
import { WORKSPACE } from './fixtures'
import { catalog } from './catalog.svelte'
import { commit } from './commit.svelte'
import { confirm } from './confirm.svelte'
import { shell } from './shell.svelte'
import { blockFocus, registerBlock } from './block-focus.svelte'
import { leap } from './leap.svelte'
import { blockMenu } from './block-menu.svelte'
import { navBlocks } from '../blocks'
import { threads } from './threads.svelte'
import type { Block } from '../thread'
import { registerColumnBody } from './columns'


const QUESTION = { title: 'quit', message: 'work is running', confirmLabel: 'quit' }

beforeEach(() => {
  confirm.answer(false)
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'OCARINA'
  shell.pendingClose = null
  commit.close()
  leap.end()
  blockFocus.clear('s1')
  blockMenu.close()
  leapRelease()
  leapRelease = () => {}
})

/** Stands a leap up in its labelled phase without a DOM to walk.
 *
 *  The walk and the paint are the browser's half of this feature; what the key
 *  path needs to know is only that a leap is up and what it is offering. */
function leaping(threadId = 's1'): void {
  leap.threadId = threadId
  leap.typed = 'ab'
  leap.group = 0
  leap.targets = [{ navId: 'b1', top: 0, left: 0 }]
  // Landing refuses a block nothing drew, so the destination has to exist.
  leapRelease = registerBlock(threadId, 'b1', {
    scrollIntoView() {},
  } as unknown as HTMLElement)
}

let leapRelease = (): void => {}


// A leap owns every key while it is up — that is what lets a label be `j` and
// a searched character be `a`. The rank matters in both directions: below the
// modals, above navigation.
describe('the leap through the real key path', () => {
  it('swallows a key that would otherwise move the focus', () => {
    leaping()

    expect(shell.handleKey({ key: 'l' })).toBe(true)
    expect(app.focus[0]).toBe(0)
  })

  it('takes the label and leaves', () => {
    leaping()

    shell.handleKey({ key: 's' })

    expect(leap.active).toBe(false)
    expect(blockFocus.idOf('s1')).toBe('b1')
  })

  it('gives up on a key that names nothing, without moving the focus', () => {
    leaping()

    shell.handleKey({ key: '1' })

    expect(leap.active).toBe(false)
    expect(blockFocus.idOf('s1')).toBeNull()
  })

  it('cancels on escape without moving the focus', () => {
    leaping()

    shell.handleKey({ key: 'Escape' })

    expect(leap.active).toBe(false)
    expect(blockFocus.idOf('s1')).toBeNull()
  })

  it('is not dismissed by reaching for a modifier', () => {
    leaping()

    expect(shell.handleKey({ key: 'Shift' })).toBe(false)
    expect(leap.active).toBe(true)
  })

  it('yields to the destructive modal, which outranks it', () => {
    leaping()
    void confirm.ask(QUESTION)

    shell.handleKey({ key: 'Escape' })

    expect(confirm.pending).toBe(false)
    expect(leap.active).toBe(true)
  })

  it('yields to the commit card as well', async () => {
    leaping()
    await commit.load()

    shell.handleKey({ key: 'Escape' })

    expect(commit.open).toBe(false)
    expect(leap.active).toBe(true)
  })
})
