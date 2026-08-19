import { describe, expect, it } from 'vitest'
import type { KeyBinding } from '../../../shared/config-file'
import {
  buildKeymap,
  decodePress,
  effectiveKey,
  EMPTY_KEYMAP,
  encodePress,
  isAction,
  keymapProblems,
  SHIPPED_KEYS,
} from './keymap'

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
    expect(keymapProblems(bindings).map((one) => one.binding.key)).toEqual(['x'])
  })

  it('reports a binding written in the wrong mode, rather than dropping it', () => {
    // The parser accepts DIFF, and no action lives there — so every DIFF
    // binding was being dropped without a word.
    const problems = keymapProblems([bind('DIFF', 'x', 'block.down')])
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toContain('lives in READ')
  })

  it('says nothing about a binding it will honour', () => {
    expect(keymapProblems([bind('NORMAL', 'x', 'thread.next')])).toEqual([])
  })

  it('binds nothing', () => {
    const keymap = buildKeymap([bind('NORMAL', 'x', 'thread.nxet')])
    expect(effectiveKey(keymap, 'NORMAL', 'x')).toBe('x')
  })
})

describe('a press with control held', () => {
  it('is encoded as a chord, and decoded back to the event the reducer reads', () => {
    expect(encodePress({ key: 'd', ctrlKey: true })).toBe('C-d')
    expect(encodePress({ key: 'd' })).toBe('d')
    expect(decodePress('C-d')).toEqual({ key: 'd', ctrlKey: true })
    expect(decodePress('d')).toEqual({ key: 'd', ctrlKey: false })
  })

  it('leaves meta and alt chords alone — those belong to the app and the OS', () => {
    expect(encodePress({ key: 'k', metaKey: true })).toBe('k')
    expect(encodePress({ key: 'j', altKey: true })).toBe('j')
  })

  it('can be rebound: a plain key can mean the half-page scroll', () => {
    const keymap = buildKeymap([bind('NORMAL', 'z', 'scroll.down')])
    expect(effectiveKey(keymap, 'NORMAL', 'z')).toBe('C-d')
  })
})

describe('a NORMAL binding pressed in READ', () => {
  it('falls through, because the NORMAL keys themselves fall through', () => {
    // `y` yanks from READ too. A reader who moved `y` to `c` expects `c` to
    // yank from READ, the same way `y` did.
    const keymap = buildKeymap([bind('NORMAL', 'x', 'thread.next')])
    expect(effectiveKey(keymap, 'READ', 'x')).toBe('l')
  })

  it("never shadows a key READ owns itself", () => {
    // Stealing NORMAL `h` must not take READ's collapse with it.
    const keymap = buildKeymap([bind('NORMAL', 'h', 'thread.rename')])
    expect(effectiveKey(keymap, 'READ', 'h')).toBe('h')
  })

  it('loses to an explicit READ binding on the same key', () => {
    const keymap = buildKeymap([
      bind('NORMAL', 'x', 'thread.next'),
      bind('READ', 'x', 'block.down'),
    ])
    expect(effectiveKey(keymap, 'READ', 'x')).toBe('j')
  })
})

describe('the shipped table', () => {
  it('labels and groups every action, for the screens that draw it', () => {
    for (const entry of Object.values(SHIPPED_KEYS)) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.group.length).toBeGreaterThan(0)
    }
  })

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
