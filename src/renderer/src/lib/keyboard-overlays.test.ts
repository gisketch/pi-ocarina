/** Who owns the keyboard while something is drawn over the strip.
 *
 *  Split from `keyboard.test.ts`, which asks what a key does *to* the strip.
 *  This asks the prior question: whether the key reaches it at all. A caret
 *  owns its keys and so does an open screen, and every leak between the two
 *  has been a key moving something the reader could not see.
 */

import { describe, expect, it } from 'vitest'
import { type KeyEventLike, type KeyState, initialKeyState } from './keyboard'
import { press as pressWith } from './keyboard-press'

const ctx = { workspaceCount: 3, terminalColumn: false }

const press = (state: KeyState, ...keys: (string | KeyEventLike)[]) =>
  pressWith(ctx, state, ...keys)

const NORMAL = initialKeyState
const INSERT: KeyState = { ...initialKeyState, mode: 'CHAT' }

describe('typing guards', () => {
  it('swallows NORMAL letter bindings while in INSERT', () => {
    for (const key of ['h', 'l', 'j', 'k', 't', 'w', 'y', 'i', ' ', '?']) {
      const { state, actions, last } = press(INSERT, key)
      expect(actions, `key ${key} must not act while typing`).toEqual([])
      expect(last.preventDefault, `key ${key} must reach the input`).toBe(false)
      expect(state.mode).toBe('CHAT')
    }
  })

  it('never jumps workspaces from a screen drawn over the strip', () => {
    // Digits used to reach the strip from any overlay — an escape hatch that
    // moved the columns behind the dialog the reader was reading, and closed
    // the dialog on the way out.
    expect(press(INSERT, '2').actions).toEqual([])
    for (const overlay of ['palette', 'switcher', 'settings', 'keymap', 'workspace'] as const) {
      const open: KeyState = { ...NORMAL, overlay }
      expect(press(open, '2').actions, `digit reached the strip under ${overlay}`).toEqual([])
      expect(press(open, '2').state.overlay, `digit closed ${overlay}`).toBe(overlay)
    }
  })

  it('swallows the transcript keys under a screen that has no use for them', () => {
    // The settings screen reads `j` and `k` itself and nothing else. Every
    // other binding used to run underneath it: `j` put the column behind into
    // READ, `t` opened a terminal, `H` moved a column nobody could see.
    const settings: KeyState = { ...NORMAL, overlay: 'settings' }
    for (const key of ['j', 'k', 'h', 'l', 't', 'G', 'H', 'L', 'o', 'a', 's', 'y', 'i', ' ']) {
      const { state, actions } = press(settings, key)
      expect(actions, `key ${key} acted under the settings screen`).toEqual([])
      expect(state).toEqual(settings)
    }
  })

  it('does not act on plain typing inside the palette', () => {
    const palette: KeyState = { ...initialKeyState, overlay: 'palette' }
    expect(press(palette, 'w').actions).toEqual([])
    expect(press(palette, 'w').last.preventDefault).toBe(false)
  })

  it('escape leaves INSERT and blurs the composer', () => {
    const { state, actions } = press(INSERT, 'Escape')
    expect(state.mode).toBe('OCARINA')
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

  it('leaves an open screen open, and the strip alone, on a digit', () => {
    const open = press(NORMAL, 'w').state
    const pressed = press(open, '3')
    expect(pressed.state.overlay).toBe('switcher')
    expect(pressed.actions).toEqual([])
  })

  it('swaps screens on another screen\u2019s key, which acts on no column', () => {
    const settings = press(NORMAL, ',').state
    expect(press(settings, 'm').state.overlay).toBe('model')
    expect(press(settings, ',').state.overlay).toBe(null)
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
    expect(state.mode).toBe('OCARINA')
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

describe('workspace settings', () => {
  it('opens on the shifted comma', () => {
    expect(press(NORMAL, '<').state.overlay).toBe('workspace')
  })

  it('keeps its keys once it is open, so j and y belong to the screen', () => {
    // It walks rows with j/k and copies an install line with y. A second `<`
    // reaching the reducer would mean those keys were never really the
    // screen's; esc is what closes it.
    expect(press(NORMAL, '<', '<').state.overlay).toBe('workspace')
    expect(press(NORMAL, '<', 'Escape').state.overlay).toBe(null)
  })

  it('is a sibling of settings, not a room inside it', () => {
    const settings = press(NORMAL, ',').state
    expect(press(settings, '<').state.overlay).toBe('workspace')
  })

  it('does not steal the key from a focused input', () => {
    const insert = press(NORMAL, 'i').state
    expect(press(insert, '<').state.overlay).toBe(null)
  })
})

describe('search', () => {
  it('opens on slash, the convention every editor already taught', () => {
    expect(press(NORMAL, '/').state.overlay).toBe('search')
  })

  it('leader f finds files now, not threads — slash already finds those', () => {
    expect(press(NORMAL, ' ', 'f').state.overlay).toBe('filefind')
  })

  it('every letter reaches the file search filter, none the strip', () => {
    const open = press(NORMAL, ' ', 'f').state
    // `t` opens the terminal from NORMAL; over the file search it must be a
    // filter character instead.
    expect(press(open, 't').state.overlay).toBe('filefind')
    expect(press(open, 't').actions).toEqual([])
  })

  it('escape closes the file search', () => {
    const open = press(NORMAL, ' ', 'f').state
    expect(press(open, 'Escape').state.overlay).toBe(null)
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

describe('the voice picker', () => {
  it('opens on ⇧M from NORMAL, with no chord in front of it', () => {
    // The model a thread answers with and the voice it answers in are the same
    // kind of choice, so they sit on the same key.
    expect(press(NORMAL, 'M').state.overlay).toBe('mode')
  })

  it('keeps the key once open, because the picker filters as you type', () => {
    // Unlike the settings screen, which has no field: a second `⇧M` there
    // closes it. The voice picker owns every letter while it is up, so `esc`
    // is the way out — the same bargain the model picker and the switcher make.
    const open = press(NORMAL, 'M').state
    expect(press(open, 'M').actions).toEqual([])
    expect(press(open, 'M').last.preventDefault).toBe(false)
    expect(press(open, 'Escape').state.overlay).toBeNull()
  })

  it('is still reachable through the leader chord', () => {
    expect(press(NORMAL, ' ', 'M').state.overlay).toBe('mode')
  })
})

describe('reaching for a capital inside a chord', () => {
  it('does not end the chord on the shift key itself', () => {
    // A capital is two keydowns. Read as a chord key, the first one cancelled
    // the chord and the letter then ran as a plain NORMAL binding — `␣S` and
    // `␣M` could not be typed at all.
    const held = press(NORMAL, ' ', 'Shift')
    expect(held.state.mode).toBe('LEADER')
    expect(held.actions).toEqual([])
    expect(held.last.timer).toBeNull()

    expect(press(held.state, 'S').state.overlay).toBe('workspace')
  })

  it('ignores every modifier, not only shift', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']) {
      const held = press(NORMAL, ' ', key)
      expect(held.state.mode, `${key} ended the chord`).toBe('LEADER')
    }
  })
})
