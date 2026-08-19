/** The buffer column's rung of the mode ladder (spec D3).
 *
 *  From OCARINA, ⏎ and `i` drop into vim; inside vim the editor owns every
 *  key, and Escape walks one rung — vim's own exit from INSERT, the shell's
 *  from NORMAL. */

import { describe, expect, it } from 'vitest'
import { initialKeyState, type KeyState } from './keyboard'
import { press as pressWith } from './keyboard-press'

const buffer = { workspaceCount: 1, terminalColumn: false, bufferColumn: true }
const plain = { workspaceCount: 1, terminalColumn: false }

const OCARINA = initialKeyState
const NORMAL: KeyState = { ...initialKeyState, mode: 'NORMAL' }
const INSERT: KeyState = { ...initialKeyState, mode: 'INSERT' }

describe('entering the buffer from OCARINA', () => {
  it('enter gives motions: vim NORMAL, editor focused', () => {
    const { state, actions } = pressWith(buffer, OCARINA, 'Enter')
    expect(state.mode).toBe('NORMAL')
    expect(actions).toEqual([{ type: 'bufferEnter', insert: false }])
  })

  it('i starts typing here, the same meaning it has on a chat column', () => {
    const { state, actions } = pressWith(buffer, OCARINA, 'i')
    expect(state.mode).toBe('INSERT')
    expect(actions).toEqual([{ type: 'bufferEnter', insert: true }])
  })

  it('off a buffer column, enter and i keep their old jobs', () => {
    expect(pressWith(plain, OCARINA, 'Enter').actions).toEqual([])
    const { state, actions } = pressWith(plain, OCARINA, 'i')
    expect(state.mode).toBe('CHAT')
    expect(actions).toEqual([{ type: 'focusComposer' }])
  })

  it('j does not enter READ on a buffer — the editor is the transcript', () => {
    const { state } = pressWith(buffer, OCARINA, 'j')
    expect(state.mode).toBe('OCARINA')
  })
})

describe('inside vim', () => {
  it('NORMAL leaves every letter to the editor', () => {
    for (const key of ['h', 'j', 'k', 'l', 'i', 'w', 'd', ':', ' ']) {
      const { state, actions, last } = pressWith(buffer, NORMAL, key)
      expect(actions, `key ${key} must stay vim's`).toEqual([])
      expect(last.preventDefault).toBe(false)
      expect(state.mode).toBe('NORMAL')
    }
  })

  it('escape from NORMAL hands the keyboard back to the strip', () => {
    const { state, actions } = pressWith(buffer, NORMAL, 'Escape')
    expect(state.mode).toBe('OCARINA')
    expect(actions).toEqual([{ type: 'bufferBlur' }])
  })

  it('INSERT leaves even Escape to vim — the mirror moves the mode', () => {
    const { state, actions, last } = pressWith(buffer, INSERT, 'Escape')
    expect(state.mode).toBe('INSERT')
    expect(actions).toEqual([])
    expect(last.preventDefault).toBe(false)
  })

  it('no overlay opens over vim: the keys are content, not bindings', () => {
    for (const key of ['w', '/', ',', '?']) {
      expect(pressWith(buffer, NORMAL, key).state.overlay).toBe(null)
    }
  })
})
