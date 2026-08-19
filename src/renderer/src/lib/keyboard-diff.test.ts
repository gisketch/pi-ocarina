import { describe, expect, it } from 'vitest'
import { initialKeyState, reduceKey, type KeyEventLike, type KeyState } from './keyboard'

const ctx = { workspaceCount: 3, terminalColumn: false }
const NORMAL = initialKeyState
const READ: KeyState = { ...initialKeyState, mode: 'READ' }
const press = (state: KeyState, key: string | KeyEventLike) =>
  reduceKey(state, typeof key === 'string' ? { key } : key, ctx)

describe('opening the change viewer', () => {
  it('opens on d from the strip', () => {
    const { state, actions } = press(NORMAL, 'd')

    expect(state.mode).toBe('DIFF')
    expect(actions).toEqual([{ type: 'openChanges' }])
  })

  it('opens on d from inside a transcript', () => {
    // The reader who has just read an edit in the ledger is the one most
    // likely to want all of it, so READ must not swallow the key.
    const { state, actions } = press(READ, 'd')

    expect(state.mode).toBe('DIFF')
    expect(actions).toEqual([{ type: 'openChanges' }])
  })

  it('leaves d alone while typing', () => {
    const insert: KeyState = { ...initialKeyState, mode: 'CHAT' }
    expect(press(insert, 'd').actions).toEqual([])
    expect(press(insert, 'd').state.mode).toBe('CHAT')
  })

  it('leaves d alone in a shell, where the pty owns every key', () => {
    const term: KeyState = { ...initialKeyState, mode: 'TERM' }
    expect(press(term, 'd').actions).toEqual([])
  })

  it('does not read a chord as the binding', () => {
    expect(press(NORMAL, { key: 'd', metaKey: true }).actions).not.toEqual([
      { type: 'openChanges' },
    ])
  })

  it('does not collide with a binding that already existed', () => {
    // Every letter the reducer binds, before d was added to it.
    for (const key of ['a', 'c', 'f', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 's', 't', 'w', 'x', 'y']) {
      expect(press(NORMAL, key).state.mode).not.toBe('DIFF')
    }
  })
})

describe('the leader chord', () => {
  const LEADER: KeyState = { ...initialKeyState, mode: 'LEADER' }

  it('opens the viewer on space then d', () => {
    const { state, actions } = press(LEADER, 'd')

    expect(state.mode).toBe('DIFF')
    expect(actions).toEqual([{ type: 'openChanges' }])
  })

  it('does not shadow a chord that already existed', () => {
    for (const key of ['w', 'k', 's', 'm', 'f', 'n', 'x', 't', 'c', 'h', 'l']) {
      expect(press(LEADER, key).state.mode).not.toBe('DIFF')
    }
  })
})

describe('a column with nothing behind it', () => {
  it('still reduces d in NORMAL — the shell decides whether there is anything to show', () => {
    // The reducer is pure and does not know whether the column is fresh; the
    // guard lives in the action, which is why this asserts the action rather
    // than the mode staying put.
    expect(press(NORMAL, 'd').actions).toEqual([{ type: 'openChanges' }])
  })
})
