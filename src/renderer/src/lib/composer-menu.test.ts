import { describe, expect, it } from 'vitest'
import { menuKey } from './composer-menu'

const key = (k: string, shiftKey = false) => ({ key: k, shiftKey })
const meta = (k: string) => ({ key: k, metaKey: true })

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

  it('writes the highlighted entry into the sentence on tab', () => {
    // Both menus: a path from the file picker, a skill from the command menu.
    // Never runs it — that is what enter is for.
    expect(menuKey(key('Tab'), 'mention', 1, 3)).toEqual({ kind: 'insert', index: 1 })
    expect(menuKey(key('Tab'), 'slash', 1, 3)).toEqual({ kind: 'insert', index: 1 })
  })

  it('leaves every ordinary character to be typed', () => {
    for (const k of ['a', ' ', 'Backspace', 'ArrowLeft', 'Home']) {
      expect(menuKey(key(k), 'slash', 0, 3), `${k} was taken by the menu`).toBeNull()
    }
  })
})

describe('walking it with the command key', () => {
  it('moves down on ⌘j and up on ⌘k, wrapping', () => {
    expect(menuKey(meta('j'), 'slash', 2, 3)).toEqual({ kind: 'move', to: 0 })
    expect(menuKey(meta('k'), 'slash', 0, 3)).toEqual({ kind: 'move', to: 2 })
  })

  it('takes ⌘k from the command palette while a list is open', () => {
    // The palette is one `esc` away; a reader inside a list is reaching for
    // the list.
    expect(menuKey(meta('k'), 'mention', 1, 3)).toEqual({ kind: 'move', to: 0 })
  })

  it('leaves every other chord alone', () => {
    for (const k of ['a', 'Enter', 'z', 'ArrowDown']) {
      expect(menuKey(meta(k), 'slash', 0, 3), `⌘${k} was taken`).toBeNull()
    }
  })
})
