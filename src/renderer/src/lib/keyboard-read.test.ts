import { describe, expect, it } from 'vitest'
import { type KeyEventLike, type KeyState, initialKeyState } from './keyboard'
import { press as pressWith } from './keyboard-press'

const ctx = { workspaceCount: 3, terminalColumn: false }
const press = (state: KeyState, ...keys: (string | KeyEventLike)[]) =>
  pressWith(ctx, state, ...keys)

const READ: KeyState = { ...initialKeyState, mode: 'READ' }

describe('READ, the transcript mode', () => {
  it('keeps j and k on the blocks', () => {
    expect(press(READ, 'j').actions).toEqual([{ type: 'moveBlock', delta: 1 }])
    expect(press(READ, 'ArrowDown').actions).toEqual([{ type: 'moveBlock', delta: 1 }])
    expect(press(READ, 'k').actions).toEqual([{ type: 'moveBlock', delta: -1 }])
  })

  it('gives h and l to the block rather than to the strip', () => {
    expect(press(READ, 'l').actions).toEqual([{ type: 'expandBlock', open: true }])
    expect(press(READ, 'h').actions).toEqual([{ type: 'expandBlock', open: false }])
  })

  it('cannot slide into the next thread by holding a key', () => {
    const { state, actions } = press(READ, 'l', 'l', 'l')

    expect(actions.every((action) => action.type === 'expandBlock')).toBe(true)
    expect(state.mode).toBe('READ')
  })

  it('keeps the mode when esc closes an overlay opened from it', () => {
    // One thing at a time. The keymap goes; the transcript is still where the
    // reader was, and the next esc is the one that leaves it.
    const { state } = press(READ, '?')
    expect(state.overlay).toBe('keymap')
    expect(state.mode).toBe('READ')

    const closed = press(state, 'Escape')
    expect(closed.state.overlay).toBeNull()
    expect(closed.state.mode).toBe('READ')

    expect(press(closed.state, 'Escape').state.mode).toBe('NORMAL')
  })

  it('hands the caret back when esc closes an overlay opened while typing', () => {
    // ⌘K from INSERT: the palette took the caret. Closing it without giving
    // the caret back leaves a mode that says INSERT and a keyboard that does
    // nothing at all.
    const typing: KeyState = { ...initialKeyState, mode: 'INSERT' }
    const open = press(typing, { key: 'k', metaKey: true })
    expect(open.state.overlay).toBe('palette')

    const closed = press(open.state, 'Escape')

    expect(closed.state.overlay).toBeNull()
    expect(closed.state.mode).toBe('INSERT')
    expect(closed.actions).toEqual([{ type: 'focusComposer' }])
  })

  it('goes back to the strip on esc, which is where h and l work again', () => {
    const { state } = press(READ, 'Escape')

    expect(state.mode).toBe('NORMAL')
    expect(press(state, 'l').actions).toEqual([{ type: 'moveThread', delta: 1 }])
  })

  it('still moves the column itself on shift', () => {
    expect(press(READ, 'L').actions).toEqual([{ type: 'moveColumn', delta: 1 }])
    expect(press(READ, 'H').actions).toEqual([{ type: 'moveColumn', delta: -1 }])
  })

  it('keeps every binding that is not a direction', () => {
    expect(press(READ, 'a').actions).toEqual([{ type: 'openBlockMenu' }])
    expect(press(READ, 's').actions).toEqual([{ type: 'leap' }])
    expect(press(READ, { key: 'd', ctrlKey: true }).actions).toEqual([{ type: 'page', delta: 1 }])
    expect(press(READ, 'y').actions).toEqual([{ type: 'yank' }])
    expect(press(READ, '2').actions).toEqual([{ type: 'goWorkspace', index: 1 }])
    expect(press(READ, ' ').state.mode).toBe('LEADER')
    expect(press(READ, 'i').state.mode).toBe('INSERT')
  })
})
