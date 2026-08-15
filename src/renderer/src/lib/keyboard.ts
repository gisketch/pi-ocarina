import type { Mode } from './types'

export type Overlay = 'palette' | 'switcher' | 'keymap' | 'settings'

export interface KeyState {
  mode: Mode
  /** Overlays are mutually exclusive by construction. */
  overlay: Overlay | null
  terminal: boolean
}

export type Action =
  | { type: 'goWorkspace'; index: number }
  | { type: 'moveThread'; delta: number }
  | { type: 'scrollColumn'; delta: number }
  | { type: 'newThread' }
  | { type: 'compact' }
  | { type: 'yank' }
  | { type: 'focusComposer' }
  | { type: 'blurComposer' }
  | { type: 'focusPalette' }
  | { type: 'focusSwitcher' }

export interface KeyEventLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

export interface KeyContext {
  /** Number of pinned workspaces; digit keys beyond this are ignored. */
  workspaceCount: number
}

export interface KeyResult {
  state: KeyState
  actions: Action[]
  /** Caller should preventDefault when true. */
  preventDefault: boolean
  /** Leader timeout lifecycle for the caller to honour. */
  timer: 'start' | 'clear' | null
}

export const LEADER_TIMEOUT_MS = 2600
export const SCROLL_STEP = 100

export const initialKeyState: KeyState = { mode: 'NORMAL', overlay: null, terminal: false }

function result(
  state: KeyState,
  actions: Action[] = [],
  preventDefault = true,
  timer: KeyResult['timer'] = null,
): KeyResult {
  return { state, actions, preventDefault, timer }
}

function digitFor(key: string, count: number): number | null {
  if (key.length !== 1) return null
  const n = Number(key)
  if (!Number.isInteger(n) || n < 1 || n > count) return null
  return n - 1
}

/** Selecting a workspace always dismisses overlays and leaves the leader chord. */
function goWorkspace(state: KeyState, index: number): KeyResult {
  return result({ ...state, overlay: null, mode: state.mode === 'LEADER' ? 'NORMAL' : state.mode }, [
    { type: 'goWorkspace', index },
  ])
}

/** Overlays that own a text caret. Their input must receive every keystroke
 *  the shell would otherwise read as a binding. */
const TYPING_OVERLAYS: ReadonlySet<Overlay> = new Set<Overlay>(['palette', 'switcher'])

function focusFor(overlay: Overlay | null): Action[] {
  if (overlay === 'palette') return [{ type: 'focusPalette' }]
  if (overlay === 'switcher') return [{ type: 'focusSwitcher' }]
  return []
}

function toggleOverlay(state: KeyState, overlay: Overlay): KeyResult {
  const next = state.overlay === overlay ? null : overlay
  return result({ ...state, overlay: next }, focusFor(next))
}

/** Resolves one key against the shell's modal model.
 *
 *  Pure on purpose: the whole keyboard contract in the shell spec is exercised
 *  headlessly in keyboard.test.ts, and DOM focus is a consequence of the returned
 *  actions rather than a hidden input to them. */
export function reduceKey(state: KeyState, event: KeyEventLike, ctx: KeyContext): KeyResult {
  const { key } = event
  const mod = Boolean(event.metaKey || event.ctrlKey)

  // Escape and ⌘K work from every mode, including while typing.
  if (key === 'Escape') {
    return result(
      { ...state, mode: 'NORMAL', overlay: null },
      state.mode === 'INSERT' ? [{ type: 'blurComposer' }] : [],
      true,
      'clear',
    )
  }

  if (mod && key.toLowerCase() === 'k') {
    const opening = state.overlay !== 'palette'
    return result(
      { ...state, overlay: opening ? 'palette' : null, mode: state.mode === 'LEADER' ? 'NORMAL' : state.mode },
      opening ? [{ type: 'focusPalette' }] : [],
      true,
      'clear',
    )
  }

  if (event.altKey || mod) return result(state, [], false)

  if (state.mode === 'LEADER') return reduceLeader(state, key, ctx)

  const anyOverlay = state.overlay !== null
  // An overlay with an input owns the caret whenever it is open.
  const typing =
    state.mode === 'INSERT' || (state.overlay !== null && TYPING_OVERLAYS.has(state.overlay))

  // Digits jump workspaces even from a focused palette — the design's escape hatch.
  const index = digitFor(key, ctx.workspaceCount)
  if (index !== null && (!typing || anyOverlay)) return goWorkspace(state, index)

  // Everything below is NORMAL-only; typing must reach the input untouched.
  if (typing) return result(state, [], false)

  switch (key) {
    case ' ':
      return result({ ...state, mode: 'LEADER' }, [], true, 'start')
    case 'h':
    case 'ArrowLeft':
      return result(state, [{ type: 'moveThread', delta: -1 }])
    case 'l':
    case 'ArrowRight':
      return result(state, [{ type: 'moveThread', delta: 1 }])
    case 'j':
      return result(state, [{ type: 'scrollColumn', delta: SCROLL_STEP }])
    case 'k':
      return result(state, [{ type: 'scrollColumn', delta: -SCROLL_STEP }])
    case 't':
      return result({ ...state, terminal: !state.terminal })
    case 'w':
      return toggleOverlay(state, 'switcher')
    case '?':
      return toggleOverlay(state, 'keymap')
    case ',':
      return toggleOverlay(state, 'settings')
    case 'i':
      return result({ ...state, mode: 'INSERT' }, [{ type: 'focusComposer' }])
    case 'y':
      return result(state, [{ type: 'yank' }])
    default:
      return result(state, [], false)
  }
}

/** Leader chords: one key, then the chord always ends. */
function reduceLeader(state: KeyState, key: string, ctx: KeyContext): KeyResult {
  const done: KeyState = { ...state, mode: 'NORMAL' }

  const index = digitFor(key, ctx.workspaceCount)
  if (index !== null) {
    return result({ ...done, overlay: null }, [{ type: 'goWorkspace', index }], true, 'clear')
  }

  switch (key) {
    case 'w':
      return result({ ...done, overlay: 'switcher' }, focusFor('switcher'), true, 'clear')
    case 'k':
      return result({ ...done, overlay: 'keymap' }, [], true, 'clear')
    case 's':
      return result({ ...done, overlay: 'settings' }, [], true, 'clear')
    case 'n':
      return result({ ...done, overlay: null }, [{ type: 'newThread' }], true, 'clear')
    case 't':
      return result({ ...done, terminal: !state.terminal }, [], true, 'clear')
    case 'c':
      return result(done, [{ type: 'compact' }], true, 'clear')
    case 'h':
      return result(done, [{ type: 'moveThread', delta: -1 }], true, 'clear')
    case 'l':
      return result(done, [{ type: 'moveThread', delta: 1 }], true, 'clear')
    default:
      // Unknown key (and Escape, handled earlier) simply cancels the chord.
      return result(done, [], true, 'clear')
  }
}
