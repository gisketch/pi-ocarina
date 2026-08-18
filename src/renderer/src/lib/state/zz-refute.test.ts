import { beforeEach, describe, expect, it } from 'vitest'
import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'
import { buildKeymap, EMPTY_KEYMAP } from '../keymap'

/** A stand-in for a real DOM KeyboardEvent: WebIDL puts every attribute on the
 *  prototype as an accessor, which is exactly what object spread does not copy.
 *  Verified above with node's own Event: Object.keys(new Event('x')) === []. */
class FakeKeyboardEvent {
  #key: string
  #meta: boolean
  #ctrl: boolean
  constructor(key: string, { metaKey = false, ctrlKey = false } = {}) {
    this.#key = key
    this.#meta = metaKey
    this.#ctrl = ctrlKey
  }
  get key() { return this.#key }
  get metaKey() { return this.#meta }
  get ctrlKey() { return this.#ctrl }
  get altKey() { return false }
}

const WORKSPACE = {
  id: 'w1', name: 'pi-core', note: 'D', hue: 152, git: null, snippet: '/code/pi-core',
  threads: [
    { id: 's1', title: 'first', status: 'idle' as const, meta: '' },
    { id: 's2', title: 'second', status: 'idle' as const, meta: '' },
  ],
}

beforeEach(() => {
  catalog.workspaces = [WORKSPACE]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0]
  app.mode = 'NORMAL'
  shell.pendingClose = null
  shell.keymap = EMPTY_KEYMAP
})

describe('modifier chords through the remap path', () => {
  it('spread really does strip prototype accessors', () => {
    const e = new FakeKeyboardEvent('n', { metaKey: true })
    expect(e.metaKey).toBe(true)
    expect({ ...e, key: 'l' }).toEqual({ key: 'l' })
  })

  it('CONTROL: with no keymap, Cmd+L is ignored', () => {
    const before = app.threadIndex
    const consumed = shell.handleKey(new FakeKeyboardEvent('l', { metaKey: true }) as never)
    expect(app.threadIndex).toBe(before)
    expect(consumed).toBe(false)
  })

  it('CLAIM: with n -> thread.next bound, Cmd+N moves the column and is swallowed', () => {
    shell.keymap = buildKeymap([{ mode: 'NORMAL', key: 'n', action: 'thread.next' }])
    const before = app.threadIndex
    const consumed = shell.handleKey(new FakeKeyboardEvent('n', { metaKey: true }) as never)
    console.log('threadIndex', before, '->', app.threadIndex, 'consumed:', consumed)
    expect(app.threadIndex).toBe(before)
    expect(consumed).toBe(false)
  })

  it('CLAIM: with k -> thread.next bound, Cmd+K no longer opens the palette', () => {
    shell.keymap = buildKeymap([{ mode: 'NORMAL', key: 'k', action: 'thread.next' }])
    shell.handleKey(new FakeKeyboardEvent('k', { metaKey: true }) as never)
    console.log('overlay after Cmd+K:', shell.overlay)
    expect(shell.overlay).toBe('palette')
  })
})
