import { describe, expect, it } from 'vitest'
import { xtermShouldHandle } from './terminal-keys'

describe('who owns a key while the shell has the caret', () => {
  it('declines Escape, which the shell reserves', () => {
    // xterm handles Escape itself and stops it before the window sees it. That
    // left the mode machine blind to the only key that leaves TERM, and made
    // the esc-esc chord unreachable because its second half never arrived.
    expect(xtermShouldHandle({ key: 'Escape' })).toBe(false)
  })

  it('leaves every other key to the terminal', () => {
    for (const key of ['a', 'h', 'l', 'j', 'k', 'i', 'Tab', 'Enter', 'ArrowUp', 'c', '1']) {
      expect(xtermShouldHandle({ key }), `${key} belongs to the pty`).toBe(true)
    }
  })
})
