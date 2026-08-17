/** Overlays that own a text caret.
 *
 *  Their input must receive every keystroke the shell would otherwise read as a
 *  binding. Split out because the list grows with every overlay that gains a
 *  field, and the review found the roles form missing from it. */

import { describe, expect, it } from 'vitest'
import { type KeyEventLike, type KeyState, initialKeyState } from './keyboard'
import { press as pressWith } from './keyboard-press'

const ctx = { workspaceCount: 3, terminalColumn: false }
const press = (state: KeyState, ...keys: (string | KeyEventLike)[]) => pressWith(ctx, state, ...keys)
const NORMAL = initialKeyState

describe('overlays that own a caret', () => {
  it('lets the roles form take every letter, so a role name is not a chord', () => {
    // Typing "scout" while the shell reads NORMAL bindings would move thread
    // focus (`l`), open the terminal (`t`) and close a column (`c`).
    const open = { ...NORMAL, overlay: 'roles' as const }
    for (const key of ['s', 'c', 'o', 'u', 't', 'a', 'd', 'l', 'h', 'j', 'k']) {
      expect(press(open, key).actions).toEqual([])
    }
  })

  it('still lets escape out of it', () => {
    const open = { ...NORMAL, overlay: 'roles' as const }
    expect(press(open, 'Escape').state.overlay).toBeNull()
  })
})
