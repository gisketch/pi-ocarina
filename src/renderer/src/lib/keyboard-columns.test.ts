/** The terminal column, and moving columns around.
 *
 *  Split from `keyboard.test.ts` because these are the two cases where a key's
 *  meaning depends on what the focused column *is* rather than on the mode —
 *  and because that file crossed the size limit.
 */

import { describe, expect, it } from 'vitest'
import { type KeyEventLike, type KeyState, initialKeyState, reduceKey } from './keyboard'
import { press as pressWith } from './keyboard-press'

const ctx = { workspaceCount: 3, terminalColumn: false }

const press = (state: KeyState, ...keys: (string | KeyEventLike)[]) =>
  pressWith(ctx, state, ...keys)

const NORMAL = initialKeyState
const INSERT: KeyState = { ...initialKeyState, mode: 'INSERT' }
const READ: KeyState = { ...initialKeyState, mode: 'READ' }

describe('TERM mode', () => {
  const TERM: KeyState = { ...initialKeyState, mode: 'TERM' }

  it('lets every key through to the pty untouched', () => {
    // Including the ones that are bindings everywhere else: a shell that
    // could not receive `h` or a digit would not be a shell.
    for (const key of ['h', 'l', 'j', 'k', 'i', 'w', '?', ' ', '1', 'H', 'L', 't', '/']) {
      const { actions, last } = press(TERM, key)
      expect(actions, `key ${key} must reach the pty`).toEqual([])
      expect(last.preventDefault, `key ${key} must not be swallowed`).toBe(false)
      expect(last.state.mode).toBe('TERM')
    }
  })

  it('keeps escape for itself, and reports it', () => {
    const { state, actions, last } = press(TERM, 'Escape')

    expect(state.mode).toBe('NORMAL')
    expect(actions).toEqual([{ type: 'termEscape' }])
    expect(last.preventDefault).toBe(true)
  })

  it('does not let the meta palette chord out of the pty', () => {
    // ⌘K is a readline binding; the shell must not steal it.
    const { actions, last } = press(TERM, { key: 'k', metaKey: true })
    expect(actions).toEqual([])
    expect(last.state.overlay).toBe(null)
  })
})

describe('moving a column', () => {
  it('moves left and right on shift-h and shift-l', () => {
    expect(press(NORMAL, 'H').actions).toEqual([{ type: 'moveColumn', delta: -1 }])
    expect(press(NORMAL, 'L').actions).toEqual([{ type: 'moveColumn', delta: 1 }])
  })

  it('leaves the lowercase pair moving focus instead', () => {
    expect(press(NORMAL, 'h').actions).toEqual([{ type: 'moveThread', delta: -1 }])
  })

  it('does not move a column while typing', () => {
    expect(press(INSERT, 'H').actions).toEqual([])
    expect(press(INSERT, 'H').last.preventDefault).toBe(false)
  })
})
