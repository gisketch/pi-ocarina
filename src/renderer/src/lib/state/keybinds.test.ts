import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyBinding } from '../../../../shared/config-file'

const saved = vi.fn().mockResolvedValue(undefined)
const loaded = vi.fn().mockResolvedValue({ path: '/tmp/keymap.json', keys: {}, problems: [] })
vi.mock('../bridge', () => ({
  bridge: { keymap: { load: (...a: unknown[]) => loaded(...a), save: (...a: unknown[]) => saved(...a) } },
}))

const handKeys: KeyBinding[] = []
vi.mock('./config.svelte', () => ({ config: { config: { get keys() { return handKeys } } } }))
vi.mock('./shell.svelte', () => ({ shell: { keymap: { translate: new Map() } } }))

const { keybinds, mergeBindings } = await import('./keybinds.svelte')
const { shell } = await import('./shell.svelte')
const { effectiveKey } = await import('../keymap')

beforeEach(() => {
  handKeys.length = 0
  saved.mockClear()
  keybinds.recording = null
  void keybinds.resetAll()
  saved.mockClear()
})

describe('the merge', () => {
  it('turns a saved rebind into a binding in the action’s own mode', () => {
    expect(mergeBindings({ 'block.down': 'n' }, [])).toEqual([
      { mode: 'READ', key: 'n', action: 'block.down' },
    ])
  })

  it('drops a UI rebind when the hand bound the same action — hand wins', () => {
    const hand: KeyBinding[] = [{ mode: 'NORMAL', key: 'x', action: 'thread.next' }]
    expect(mergeBindings({ 'thread.next': ';' }, hand)).toEqual(hand)
  })

  it('puts the hand after the UI, so a shared slot resolves to the hand', () => {
    const hand: KeyBinding[] = [{ mode: 'NORMAL', key: 'x', action: 'thread.prev' }]
    const merged = mergeBindings({ 'thread.next': 'x' }, hand)
    expect(merged[merged.length - 1]).toEqual(hand[0])
  })

  it('drops an action the registry does not know', () => {
    expect(mergeBindings({ 'thread.nxet': 'x' }, [])).toEqual([])
  })
})

describe('rebinding from the screen', () => {
  it('applies on the very next keypress, and saves the whole file', async () => {
    await keybinds.set('thread.next', ';')

    expect(effectiveKey(shell.keymap, 'NORMAL', ';')).toBe('l')
    expect(saved).toHaveBeenCalledWith({ 'thread.next': ';' })
  })

  it('stealing a press from another UI rebind unbinds the loser', async () => {
    await keybinds.set('thread.next', ';')
    await keybinds.set('thread.prev', ';')

    expect(keybinds.keys).toEqual({ 'thread.prev': ';' })
    expect(effectiveKey(shell.keymap, 'NORMAL', ';')).toBe('h')
  })

  it('never unbinds across modes — the same letter is two different slots', async () => {
    await keybinds.set('thread.next', ';')
    await keybinds.set('block.down', ';')

    expect(keybinds.keys).toEqual({ 'thread.next': ';', 'block.down': ';' })
  })

  it('rebinding back to the shipped default is a reset, not an entry', async () => {
    await keybinds.set('thread.next', ';')
    await keybinds.set('thread.next', 'l')

    expect(keybinds.keys).toEqual({})
  })

  it('reset gives one action its shipped key back', async () => {
    await keybinds.set('thread.next', ';')
    await keybinds.reset('thread.next')

    expect(keybinds.keys).toEqual({})
    expect(effectiveKey(shell.keymap, 'NORMAL', ';')).toBe(';')
  })

  it('reset all empties the file', async () => {
    await keybinds.set('thread.next', ';')
    await keybinds.set('block.down', 'n')
    await keybinds.resetAll()

    expect(keybinds.keys).toEqual({})
    expect(saved).toHaveBeenLastCalledWith({})
  })

  it('refuses Escape and the unknown', async () => {
    await keybinds.set('thread.next', 'Escape')
    await keybinds.set('thread.nxet', 'x')

    expect(keybinds.keys).toEqual({})
    expect(saved).not.toHaveBeenCalled()
  })
})

describe('recording a press', () => {
  it('takes the next key and disarms', () => {
    keybinds.recording = 'thread.next'

    expect(keybinds.handleRecordKey({ key: ';' })).toBe(true)

    expect(keybinds.recording).toBeNull()
    expect(effectiveKey(shell.keymap, 'NORMAL', ';')).toBe('l')
  })

  it('spells a control chord the way the reducer reads it', () => {
    keybinds.recording = 'thread.next'
    keybinds.handleRecordKey({ key: 'j', ctrlKey: true })

    expect(keybinds.keys).toEqual({ 'thread.next': 'C-j' })
  })

  it('cancels on Escape without binding — which is why Escape is uncapturable', () => {
    keybinds.recording = 'thread.next'

    expect(keybinds.handleRecordKey({ key: 'Escape' })).toBe(true)

    expect(keybinds.recording).toBeNull()
    expect(keybinds.keys).toEqual({})
  })

  it('lets a bare modifier pass — reaching for a capital is not an answer', () => {
    keybinds.recording = 'thread.next'

    expect(keybinds.handleRecordKey({ key: 'Shift' })).toBe(false)
    expect(keybinds.recording).toBe('thread.next')
  })

  it('answers nothing while disarmed', () => {
    expect(keybinds.handleRecordKey({ key: 'x' })).toBe(false)
  })
})

describe('what a row shows', () => {
  it('gives the UI press, then the hand press, then the shipped default', async () => {
    handKeys.push({ mode: 'NORMAL', key: 'x', action: 'thread.prev' })
    await keybinds.set('thread.next', ';')

    expect(keybinds.pressOf('thread.next')).toBe(';')
    expect(keybinds.pressOf('thread.prev')).toBe('x')
    expect(keybinds.pressOf('block.down')).toBe('j')
  })

  it('marks the hand-bound action locked', () => {
    handKeys.push({ mode: 'NORMAL', key: 'x', action: 'thread.prev' })
    expect(keybinds.lockedBy('thread.prev')).toBe(true)
    expect(keybinds.lockedBy('thread.next')).toBe(false)
  })

  it('flags the loser of a steal as unbound', async () => {
    // `;` given to thread.prev takes nothing; `l` given to thread.prev takes
    // thread.next's only key.
    await keybinds.set('thread.prev', 'l')

    expect(keybinds.unbound('thread.next')).toBe(true)
    expect(keybinds.unbound('thread.prev')).toBe(false)
  })
})

describe('loading what was saved last time', () => {
  it('reports an action the registry does not know, and keeps the rest', async () => {
    loaded.mockResolvedValueOnce({
      path: '/tmp/keymap.json',
      keys: { 'thread.next': ';', 'thread.nxet': 'x' },
      problems: [],
    })

    await keybinds.load()

    expect(effectiveKey(shell.keymap, 'NORMAL', ';')).toBe('l')
    expect(keybinds.problems.some((one) => one.message.includes('thread.nxet'))).toBe(true)
  })
})
