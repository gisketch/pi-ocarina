import { describe, expect, it } from 'vitest'
import type { KeyBinding } from '../../../shared/config-file'
import { buildKeymap, effectiveKey, EMPTY_KEYMAP, isAction, SHIPPED_KEYS, unknownActions } from './keymap'

const bind = (mode: KeyBinding['mode'], key: string, action: string): KeyBinding => ({
  mode,
  key,
  action,
})

describe('a reader who changed nothing', () => {
  it('gets exactly the shipped keys', () => {
    expect(effectiveKey(EMPTY_KEYMAP, 'NORMAL', 'l')).toBe('l')
    expect(effectiveKey(buildKeymap([]), 'READ', 'j')).toBe('j')
  })
})

describe('a rebound key', () => {
  it('is translated to the key the reducer already knows', () => {
    // A remap, not a rewrite: the reducer keeps one meaning for `l`, and the
    // two can never disagree about what it does.
    const keymap = buildKeymap([bind('NORMAL', 'x', 'thread.next')])
    expect(effectiveKey(keymap, 'NORMAL', 'x')).toBe('l')
  })

  it('leaves every other key alone', () => {
    const keymap = buildKeymap([bind('NORMAL', 'x', 'thread.next')])
    expect(effectiveKey(keymap, 'NORMAL', 'h')).toBe('h')
    expect(effectiveKey(keymap, 'NORMAL', 'l')).toBe('l')
  })

  it('applies only in the mode it was written for', () => {
    const keymap = buildKeymap([bind('READ', 'n', 'block.down')])
    expect(effectiveKey(keymap, 'READ', 'n')).toBe('j')
    expect(effectiveKey(keymap, 'NORMAL', 'n')).toBe('n')
  })

  it('is ignored when its mode is not where the action lives', () => {
    // `block.down` is a READ action. Bound in NORMAL it is a binding for
    // something that does not exist there, and quietly relocating it would
    // surprise.
    const keymap = buildKeymap([bind('NORMAL', 'n', 'block.down')])
    expect(effectiveKey(keymap, 'NORMAL', 'n')).toBe('n')
  })

  it('can move a leader chord', () => {
    const keymap = buildKeymap([bind('LEADER', 'v', 'leader.mode')])
    expect(effectiveKey(keymap, 'LEADER', 'v')).toBe('M')
  })
})

describe('an action the app does not have', () => {
  it('is reported rather than silently doing nothing', () => {
    const bindings = [bind('NORMAL', 'x', 'thread.nxet'), bind('NORMAL', 'y', 'thread.next')]
    expect(unknownActions(bindings).map((one) => one.key)).toEqual(['x'])
  })

  it('binds nothing', () => {
    const keymap = buildKeymap([bind('NORMAL', 'x', 'thread.nxet')])
    expect(effectiveKey(keymap, 'NORMAL', 'x')).toBe('x')
  })
})

describe('the shipped table', () => {
  it('names every action it binds', () => {
    for (const action of Object.keys(SHIPPED_KEYS)) expect(isAction(action)).toBe(true)
    expect(isAction('nonsense')).toBe(false)
  })

  it('binds no key twice within a mode', () => {
    const seen = new Set<string>()
    for (const { mode, key } of Object.values(SHIPPED_KEYS)) {
      expect(seen.has(`${mode} ${key}`)).toBe(false)
      seen.add(`${mode} ${key}`)
    }
  })
})
