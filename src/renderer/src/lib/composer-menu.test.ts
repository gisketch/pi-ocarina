import { describe, expect, it } from 'vitest'
import { menuKey } from './composer-menu'

const key = (k: string, shiftKey = false) => ({ key: k, shiftKey })

describe('walking the menu', () => {
  it('moves the highlight, and wraps at both ends', () => {
    expect(menuKey(key('ArrowDown'), 'slash', 2, 3)).toEqual({ kind: 'move', to: 0 })
    expect(menuKey(key('ArrowUp'), 'slash', 0, 3)).toEqual({ kind: 'move', to: 2 })
  })

  it('takes the highlighted option on enter', () => {
    expect(menuKey(key('Enter'), 'slash', 1, 3)).toEqual({ kind: 'choose', index: 1 })
  })

  it('closes on escape', () => {
    expect(menuKey(key('Escape'), 'mention', 0, 3)).toEqual({ kind: 'dismiss' })
  })
})

describe('the keys the field keeps', () => {
  it('leaves shift-enter alone, because that is a newline', () => {
    expect(menuKey(key('Enter', true), 'slash', 0, 3)).toBeNull()
  })

  it('completes a path on tab, and leaves tab to the field for commands', () => {
    expect(menuKey(key('Tab'), 'mention', 1, 3)).toEqual({ kind: 'choose', index: 1 })
    expect(menuKey(key('Tab'), 'slash', 1, 3)).toBeNull()
  })

  it('leaves every ordinary character to be typed', () => {
    for (const k of ['a', ' ', 'Backspace', 'ArrowLeft', 'Home']) {
      expect(menuKey(key(k), 'slash', 0, 3), `${k} was taken by the menu`).toBeNull()
    }
  })
})
