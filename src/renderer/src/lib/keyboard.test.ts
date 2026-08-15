import { describe, expect, it } from 'vitest'
import { type KeyEventLike, type KeyState, initialKeyState, reduceKey } from './keyboard'

const ctx = { workspaceCount: 3 }

function press(state: KeyState, ...keys: (string | KeyEventLike)[]) {
  let current = state
  let actions: ReturnType<typeof reduceKey>['actions'] = []
  let last!: ReturnType<typeof reduceKey>
  for (const k of keys) {
    const event = typeof k === 'string' ? { key: k } : k
    last = reduceKey(current, event, ctx)
    current = last.state
    actions = actions.concat(last.actions)
  }
  return { state: current, actions, last }
}

const NORMAL = initialKeyState
const INSERT: KeyState = { ...initialKeyState, mode: 'INSERT' }

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

  it('scrolls the focused column with j/k', () => {
    expect(press(NORMAL, 'j').actions).toEqual([{ type: 'scrollColumn', delta: 100 }])
    expect(press(NORMAL, 'k').actions).toEqual([{ type: 'scrollColumn', delta: -100 }])
  })

  it('enters INSERT on i and focuses the composer', () => {
    const { state, actions } = press(NORMAL, 'i')
    expect(state.mode).toBe('INSERT')
    expect(actions).toEqual([{ type: 'focusComposer' }])
  })

  it('toggles terminal, switcher and keymap', () => {
    expect(press(NORMAL, 't').state.terminal).toBe(true)
    expect(press(NORMAL, 't', 't').state.terminal).toBe(false)
    expect(press(NORMAL, 'w').state.overlay).toBe('switcher')
    expect(press(NORMAL, 'w', 'w').state.overlay).toBe(null)
    expect(press(NORMAL, '?').state.overlay).toBe('keymap')
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
      ['w', { overlay: 'switcher' }, []],
      ['k', { overlay: 'keymap' }, []],
      ['n', { overlay: null }, [{ type: 'newThread' }]],
      ['t', { terminal: true }, []],
      ['c', {}, [{ type: 'compact' }]],
      ['h', {}, [{ type: 'moveThread', delta: -1 }]],
      ['l', {}, [{ type: 'moveThread', delta: 1 }]],
    ]
    for (const [key, expectedState, expectedActions] of cases) {
      const { state, actions, last } = press(NORMAL, ' ', key)
      expect(state.mode, `chord ${key} must leave LEADER`).toBe('NORMAL')
      expect(actions).toEqual(expectedActions)
      expect(last.timer).toBe('clear')
      for (const [k, v] of Object.entries(expectedState)) {
        expect(state[k as keyof KeyState]).toEqual(v)
      }
    }
  })

  it('cancels on an unknown key without acting', () => {
    const { state, actions } = press(NORMAL, ' ', 'z')
    expect(state.mode).toBe('NORMAL')
    expect(actions).toEqual([])
  })

  it('cancels on escape', () => {
    const { state, last } = press(NORMAL, ' ', 'Escape')
    expect(state.mode).toBe('NORMAL')
    expect(last.timer).toBe('clear')
  })
})

describe('typing guards', () => {
  it('swallows NORMAL letter bindings while in INSERT', () => {
    for (const key of ['h', 'l', 'j', 'k', 't', 'w', 'y', 'i', ' ', '?']) {
      const { state, actions, last } = press(INSERT, key)
      expect(actions, `key ${key} must not act while typing`).toEqual([])
      expect(last.preventDefault, `key ${key} must reach the input`).toBe(false)
      expect(state.mode).toBe('INSERT')
    }
  })

  it('still jumps workspaces from INSERT only when an overlay is open', () => {
    expect(press(INSERT, '2').actions).toEqual([])
    const withPalette: KeyState = { ...INSERT, overlay: 'palette' }
    expect(press(withPalette, '2').actions).toEqual([{ type: 'goWorkspace', index: 1 }])
  })

  it('does not act on plain typing inside the palette', () => {
    const palette: KeyState = { ...initialKeyState, overlay: 'palette' }
    expect(press(palette, 'w').actions).toEqual([])
    expect(press(palette, 'w').last.preventDefault).toBe(false)
  })

  it('escape leaves INSERT and blurs the composer', () => {
    const { state, actions } = press(INSERT, 'Escape')
    expect(state.mode).toBe('NORMAL')
    expect(actions).toEqual([{ type: 'blurComposer' }])
  })
})

describe('overlays', () => {
  it('toggles the palette with the meta chord from any mode', () => {
    const opened = press(NORMAL, { key: 'k', metaKey: true })
    expect(opened.state.overlay).toBe('palette')
    expect(opened.actions).toEqual([{ type: 'focusPalette' }])
    expect(press(opened.state, { key: 'k', metaKey: true }).state.overlay).toBe(null)
    expect(press(INSERT, { key: 'K', ctrlKey: true }).state.overlay).toBe('palette')
  })

  it('keeps overlays mutually exclusive', () => {
    const switcher = press(NORMAL, 'w').state
    expect(switcher.overlay).toBe('switcher')
    const palette = press(switcher, { key: 'k', metaKey: true }).state
    expect(palette.overlay).toBe('palette')
  })

  it('closes any overlay on escape', () => {
    for (const key of ['w', '?']) {
      const open = press(NORMAL, key).state
      expect(press(open, 'Escape').state.overlay).toBe(null)
    }
  })

  it('dismisses overlays when a workspace is selected', () => {
    const open = press(NORMAL, 'w').state
    const jumped = press(open, '3')
    expect(jumped.state.overlay).toBe(null)
    expect(jumped.actions).toEqual([{ type: 'goWorkspace', index: 2 }])
  })

  it('ignores other modified keys', () => {
    expect(press(NORMAL, { key: 'l', metaKey: true }).last.preventDefault).toBe(false)
    expect(press(NORMAL, { key: 'l', altKey: true }).actions).toEqual([])
  })
})
