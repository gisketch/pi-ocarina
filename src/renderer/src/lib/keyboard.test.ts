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

describe('the welcome screen', () => {
  const empty = { workspaceCount: 0 }

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

  it('scrolls the focused column with j/k', () => {
    expect(press(NORMAL, 'j').actions).toEqual([{ type: 'scrollColumn', delta: 100 }])
    expect(press(NORMAL, 'k').actions).toEqual([{ type: 'scrollColumn', delta: -100 }])
  })

  it('enters INSERT on i and focuses the composer', () => {
    const { state, actions } = press(NORMAL, 'i')
    expect(state.mode).toBe('INSERT')
    expect(actions).toEqual([{ type: 'focusComposer' }])
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

describe('settings', () => {
  it('opens on comma and closes on a second comma', () => {
    expect(press(NORMAL, ',').state.overlay).toBe('settings')
    expect(press(NORMAL, ',', ',').state.overlay).toBe(null)
  })

  it('opens on the leader s chord', () => {
    const { state, last } = press(NORMAL, ' ', 's')
    expect(state.overlay).toBe('settings')
    expect(state.mode).toBe('NORMAL')
    expect(last.timer).toBe('clear')
  })

  it('does not steal keys from a focused input', () => {
    // Settings has no caret of its own, but the composer does; typing a comma
    // in a prompt must not open a dialog over it.
    const insert = press(NORMAL, 'i').state
    expect(press(insert, ',').state.overlay).toBe(null)
  })

  it('stays mutually exclusive with the other overlays', () => {
    const settings = press(NORMAL, ',').state
    expect(press(settings, '?').state.overlay).toBe('keymap')
  })
})

describe('search', () => {
  it('opens on slash, the convention every editor already taught', () => {
    expect(press(NORMAL, '/').state.overlay).toBe('search')
  })

  it('opens on the leader f chord', () => {
    expect(press(NORMAL, ' ', 'f').state.overlay).toBe('search')
  })

  it('a second slash types into the filter instead of closing it', () => {
    expect(press(NORMAL, '/', '/').state.overlay).toBe('search')
  })

  it('does not steal a slash typed into the composer', () => {
    const insert = press(NORMAL, 'i').state
    expect(press(insert, '/').state.overlay).toBe(null)
  })

  it('escape closes it', () => {
    expect(press(NORMAL, '/', 'Escape').state.overlay).toBe(null)
  })
})

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
