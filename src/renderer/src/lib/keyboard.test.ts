import { describe, expect, it } from 'vitest'
import { type KeyEventLike, type KeyState, initialKeyState, reduceKey } from './keyboard'
import { press as pressWith } from './keyboard-press'

const ctx = { workspaceCount: 3, terminalColumn: false }

const press = (state: KeyState, ...keys: (string | KeyEventLike)[]) =>
  pressWith(ctx, state, ...keys)

const NORMAL = initialKeyState
const INSERT: KeyState = { ...initialKeyState, mode: 'CHAT' }
const READ: KeyState = { ...initialKeyState, mode: 'READ' }

describe('the welcome screen', () => {
  const empty = { workspaceCount: 0, terminalColumn: false }

  it('makes ⏎ pin a folder when nothing is pinned', () => {
    const result = reduceKey(NORMAL, { key: 'Enter' }, empty)

    expect(result.actions).toEqual([{ type: 'pinWorkspace' }])
    expect(result.preventDefault).toBe(true)
  })

  it('leaves ⏎ alone once a workspace exists', () => {
    expect(reduceKey(NORMAL, { key: 'Enter' }, ctx).actions).toEqual([])
  })

  it('leaves ⏎ to an open overlay, which owns its own list', () => {
    const withOverlay: KeyState = { ...NORMAL, overlay: 'switcher' }

    expect(reduceKey(withOverlay, { key: 'Enter' }, empty).actions).toEqual([])
  })
})

describe('NORMAL bindings', () => {
  it('jumps workspaces on 1-3 and ignores out-of-range digits', () => {
    expect(press(NORMAL, '2').actions).toEqual([{ type: 'goWorkspace', index: 1 }])
    expect(press(NORMAL, '9').actions).toEqual([])
    expect(press(NORMAL, '9').last.preventDefault).toBe(false)
  })

  it('moves thread focus with h/l and arrows', () => {
    expect(press(NORMAL, 'l').actions).toEqual([{ type: 'moveThread', delta: 1 }])
    expect(press(NORMAL, 'h').actions).toEqual([{ type: 'moveThread', delta: -1 }])
    expect(press(NORMAL, 'ArrowRight').actions).toEqual([{ type: 'moveThread', delta: 1 }])
    expect(press(NORMAL, 'ArrowLeft').actions).toEqual([{ type: 'moveThread', delta: -1 }])
  })

  it('reaches into the transcript on j/k, which is a mode of its own', () => {
    expect(press(NORMAL, 'j').actions).toEqual([{ type: 'moveBlock', delta: 1 }])
    expect(press(NORMAL, 'j').state.mode).toBe('READ')
    expect(press(NORMAL, 'k').state.mode).toBe('READ')
    expect(press(NORMAL, 's').state.mode).toBe('READ')
  })

  it('leaves a shell in NORMAL, because it has no blocks to reach into', () => {
    const shellCtx = { workspaceCount: 3, terminalColumn: true }
    const result = reduceKey(NORMAL, { key: 'j' }, shellCtx)

    expect(result.state.mode).toBe('OCARINA')
    expect(result.actions).toEqual([{ type: 'moveBlock', delta: 1 }])
  })

  it('scrolls half a screen on ctrl-d and ctrl-u', () => {
    expect(press(NORMAL, { key: 'd', ctrlKey: true }).actions).toEqual([
      { type: 'scroll', delta: 1 },
    ])
    expect(press(NORMAL, { key: 'u', ctrlKey: true }).actions).toEqual([
      { type: 'scroll', delta: -1 },
    ])
  })

  it('does not reach into the transcript to do it', () => {
    // Paging from NORMAL used to move the ring, which lit one block and dimmed
    // the rest. A reader who has not asked to point at anything gets a scroll.
    for (const key of ['d', 'u']) {
      const { state, actions } = press(NORMAL, { key, ctrlKey: true })
      expect(state.mode).toBe('OCARINA')
      expect(actions.every((action) => action.type === 'scroll')).toBe(true)
    }
  })

  it('leaves ctrl-u to the composer, where it clears the line', () => {
    const result = reduceKey(INSERT, { key: 'u', ctrlKey: true }, ctx)

    expect(result.actions).toEqual([])
    expect(result.preventDefault).toBe(false)
  })

  it('leaves ctrl-d to an overlay that owns a caret', () => {
    const searching: KeyState = { ...NORMAL, overlay: 'search' }

    expect(reduceKey(searching, { key: 'd', ctrlKey: true }, ctx).actions).toEqual([])
  })

  it('does not read a paging chord as one when another modifier is held', () => {
    expect(press(NORMAL, { key: 'd', ctrlKey: true, altKey: true }).actions).toEqual([])
    expect(press(NORMAL, { key: 'd', ctrlKey: true, metaKey: true }).actions).toEqual([])
  })

  it('leaves both paging chords to the pty in TERM', () => {
    const term: KeyState = { ...initialKeyState, mode: 'TERM' }
    const result = reduceKey(term, { key: 'd', ctrlKey: true }, ctx)

    expect(result.actions).toEqual([])
    expect(result.preventDefault).toBe(false)
  })

  it('enters INSERT on i and focuses the composer', () => {
    const { state, actions } = press(NORMAL, 'i')
    expect(state.mode).toBe('CHAT')
    expect(actions).toEqual([{ type: 'focusComposer' }])
  })

  it('opens the rename dialog on ⇧R', () => {
    expect(press(NORMAL, 'R').actions).toEqual([{ type: 'renameThread' }])
  })

  it('asks for the terminal column on t', () => {
    expect(press(NORMAL, 't').actions).toEqual([{ type: 'openTerminal' }])
  })

  it('toggles the keymap', () => {
    expect(press(NORMAL, '?').state.overlay).toBe('keymap')
    expect(press(NORMAL, '?', '?').state.overlay).toBe(null)
  })

  it('opens the switcher on w and focuses its filter', () => {
    const { state, actions } = press(NORMAL, 'w')
    expect(state.overlay).toBe('switcher')
    expect(actions).toEqual([{ type: 'focusSwitcher' }])
  })

  it('a second w types into the filter instead of closing the switcher', () => {
    // The switcher owns a caret once it is open. Letting `w` still toggle it
    // would make the workspace named "web" unfilterable.
    expect(press(NORMAL, 'w', 'w').state.overlay).toBe('switcher')
    expect(press(NORMAL, 'w', 'w').last.preventDefault).toBe(false)
  })

  it('escape closes the switcher', () => {
    expect(press(NORMAL, 'w', 'Escape').state.overlay).toBe(null)
  })

  it('yanks the last code block on y', () => {
    expect(press(NORMAL, 'y').actions).toEqual([{ type: 'yank' }])
  })

  it('leaves unbound keys to the browser', () => {
    expect(press(NORMAL, 'q').last.preventDefault).toBe(false)
  })
})

describe('LEADER chords', () => {
  it('enters on space and starts the timeout', () => {
    const { state, last } = press(NORMAL, ' ')
    expect(state.mode).toBe('LEADER')
    expect(last.timer).toBe('start')
  })

  it('runs each documented chord and always ends the chord', () => {
    const cases: [string, Partial<KeyState>, unknown[]][] = [
      ['1', { overlay: null }, [{ type: 'goWorkspace', index: 0 }]],
      ['w', { overlay: 'switcher' }, [{ type: 'focusSwitcher' }]],
      ['k', { overlay: 'keymap' }, []],
      ['n', { overlay: null }, [{ type: 'newThread' }]],
      ['t', {}, [{ type: 'openTerminal' }]],
      ['c', {}, [{ type: 'compact' }]],
      ['p', {}, [{ type: 'cyclePermission' }]],
      ['S', { overlay: 'workspace' }, []],
      ['h', {}, [{ type: 'moveThread', delta: -1 }]],
      ['l', {}, [{ type: 'moveThread', delta: 1 }]],
    ]
    for (const [key, expectedState, expectedActions] of cases) {
      const { state, actions, last } = press(NORMAL, ' ', key)
      expect(state.mode, `chord ${key} must leave LEADER`).toBe('OCARINA')
      expect(actions).toEqual(expectedActions)
      expect(last.timer).toBe('clear')
      for (const [k, v] of Object.entries(expectedState)) {
        expect(state[k as keyof KeyState]).toEqual(v)
      }
    }
  })

  it('cancels on an unknown key without acting', () => {
    const { state, actions } = press(NORMAL, ' ', 'z')
    expect(state.mode).toBe('OCARINA')
    expect(actions).toEqual([])
  })

  it('cancels on escape', () => {
    const { state, last } = press(NORMAL, ' ', 'Escape')
    expect(state.mode).toBe('OCARINA')
    expect(last.timer).toBe('clear')
  })
})
