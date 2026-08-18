/** One reducer for every key the shell handles.
 *
 *  Pure: a key and the state in, the next state and a list of actions out. That
 *  is what makes the whole keyboard testable without a DOM, and it is why modes
 *  cannot drift — there is exactly one place a mode changes.
 *
 *  The vocabulary it speaks lives in `keyboard-types.ts`, re-exported here. */

import {
  initialKeyState,
  LEADER_TIMEOUT_MS,
  MODIFIER_KEYS,
  SCROLL_STEP,
  type Action,
  type KeyContext,
  type KeyEventLike,
  type KeyResult,
  type KeyState,
  type Overlay,
} from './keyboard-types'

export * from './keyboard-types'

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
const TYPING_OVERLAYS: ReadonlySet<Overlay> = new Set<Overlay>([
  'palette',
  'switcher',
  'model',
  'search',
  // The roles form has a name field, an instructions field and a model field.
  // Without this, typing a role called "scout" moved thread focus, opened the
  // terminal and closed a column. Found in review.
  'roles',
  // The voice picker filters as you type, and the voices screen has a name
  // field and a page of instructions. Same failure as the roles form, found
  // the same way.
  'mode',
  'modes',
  // `y` copies an install line, and `j`/`k` walk the rows: every key it uses
  // is its own while it is open.
  'workspace',
])

function focusFor(overlay: Overlay | null): Action[] {
  if (overlay === 'palette') return [{ type: 'focusPalette' }]
  if (overlay === 'switcher') return [{ type: 'focusSwitcher' }]
  return []
}

/** Reaching into the transcript. A shell has no blocks to reach into, so it
 *  keeps the old behaviour and stays in NORMAL. */
function enterRead(state: KeyState, ctx: KeyContext, actions: Action[]): KeyResult {
  return result(ctx.terminalColumn ? state : { ...state, mode: 'READ' }, actions)
}

/** Whether something on screen owns the caret. Everything the shell would
 *  otherwise read as a binding must reach it untouched. */
function isTyping(state: KeyState): boolean {
  return state.mode === 'INSERT' || (state.overlay !== null && TYPING_OVERLAYS.has(state.overlay))
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

  // The pty owns every key while TERM is on — including the ones that would
  // otherwise be bindings. `esc` is the single exception, and even that is only
  // half an answer: pressing it twice means "send a real escape through", which
  // needs a clock the shell has and this reducer deliberately does not.
  if (state.mode === 'TERM') {
    if (key === 'Escape') {
      return result({ ...state, mode: 'NORMAL' }, [{ type: 'termEscape' }], true, 'clear')
    }
    return result(state, [], false)
  }

  // Escape and ⌘K work from every mode, including while typing.
  if (key === 'Escape') {
    // One thing at a time. An open overlay is the nearest thing to back out
    // of, and the mode underneath it survives — so a reader who opened the
    // keymap from READ is still in READ when the keymap closes, and the next
    // press is the one that leaves the transcript.
    if (state.overlay !== null) {
      // The overlay took the caret from the composer. Giving it back is what
      // makes INSERT true again — without it the mode says one thing and
      // every keystroke goes nowhere.
      const back: Action[] = state.mode === 'INSERT' ? [{ type: 'focusComposer' }] : []
      return result({ ...state, overlay: null }, back, true, 'clear')
    }

    // The second half of `esc esc` lands here, not in the TERM branch above:
    // the first press already left TERM. The shell owns the timing and the
    // "is a shell even focused" question, so this always reports the press and
    // lets it decide — everywhere else it is a no-op.
    return result(
      { ...state, mode: 'NORMAL' },
      state.mode === 'INSERT' ? [{ type: 'blurComposer' }] : [{ type: 'termEscape' }],
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

  // Half-page paging, by the convention every pager and editor already taught.
  // It has to be resolved above the bail-out below, which exists so that every
  // other control chord reaches whatever has the caret.
  //
  // Only a reader already in READ moves the ring with it. From NORMAL the
  // chord is a scroll and nothing else: a reader skimming a transcript has
  // not asked to point at anything, and lighting one block — which dims every
  // other — is a mode change they did not ask for.
  if (event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(state)) {
    const paging = state.mode === 'READ' ? 'page' : 'scroll'
    if (key === 'd') return result(state, [{ type: paging, delta: 1 }])
    if (key === 'u') return result(state, [{ type: paging, delta: -1 }])
  }

  if (event.altKey || mod) return result(state, [], false)

  if (state.mode === 'LEADER') return reduceLeader(state, key, ctx)

  const anyOverlay = state.overlay !== null
  const typing = isTyping(state)

  // Digits jump workspaces even from a focused palette — the design's escape hatch.
  const index = digitFor(key, ctx.workspaceCount)
  if (index !== null && (!typing || anyOverlay)) return goWorkspace(state, index)

  // Everything below is NORMAL-only; typing must reach the input untouched.
  if (typing) return result(state, [], false)

  // READ owns the four direction keys. h/l stop meaning "another column" and
  // start meaning "this block, wider or narrower" — which is the point: a
  // reader walking a conversation must not slide into the next thread by
  // holding a key one press too long. `esc` is the way back to the strip.
  if (state.mode === 'READ') {
    switch (key) {
      case 'j':
      case 'ArrowDown':
        return result(state, [{ type: 'moveBlock', delta: 1 }])
      case 'k':
      case 'ArrowUp':
        return result(state, [{ type: 'moveBlock', delta: -1 }])
      case 'l':
      case 'ArrowRight':
        return result(state, [{ type: 'expandBlock', open: true }])
      case 'h':
      case 'ArrowLeft':
        return result(state, [{ type: 'expandBlock', open: false }])
    }
  }

  // The change viewer, from either mode that has a thread under it. Resolved
  // above the NORMAL bindings so READ reaches it too — a reader who has just
  // read the edit in the ledger is the one most likely to want all of it.
  if (key === 'd' && (state.mode === 'NORMAL' || state.mode === 'READ')) {
    return result({ ...state, mode: 'DIFF' }, [{ type: 'openChanges' }])
  }

  // Shift moves the column itself rather than the focus — the same relationship
  // a tiling window manager gives you, and it works on any column, thread or
  // terminal.
  if (key === 'H') return result(state, [{ type: 'moveColumn', delta: -1 }])
  if (key === 'L') return result(state, [{ type: 'moveColumn', delta: 1 }])

  // With nothing pinned the welcome screen is the whole app, and its one
  // action is the only thing ⏎ could mean.
  if (key === 'Enter' && ctx.workspaceCount === 0 && !anyOverlay) {
    return result(state, [{ type: 'pinWorkspace' }])
  }

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
      return enterRead(state, ctx, [{ type: 'moveBlock', delta: 1 }])
    case 'k':
      return enterRead(state, ctx, [{ type: 'moveBlock', delta: -1 }])
    case 't':
      return result(state, [{ type: 'openTerminal' }])
    // The end of the thread, and the follow that keeps it there. One key for
    // one destination: pressed while already following it is the same journey
    // with nothing left to travel.
    case 'G':
      return result(state, [{ type: 'jumpToLive' }])
    case 'o':
      return result(state, [{ type: 'toggleReasoning' }])
    case 'w':
      return toggleOverlay(state, 'switcher')
    case '?':
      return toggleOverlay(state, 'keymap')
    case ',':
      return toggleOverlay(state, 'settings')
    case '<':
      // The shifted sibling of `,`: same key, narrower scope. Workspace
      // settings are not a section of the app's settings, so they are not
      // reached through them.
      return toggleOverlay(state, 'workspace')
    case 'm':
      return toggleOverlay(state, 'model')
    case '/':
      // Search, by the convention every editor and pager already taught.
      return toggleOverlay(state, 'search')
    case 'i':
      return result({ ...state, mode: 'INSERT' }, [{ type: 'focusComposer' }])
    case 'a':
      // The reducer does not know whether a block is focused; the shell drops
      // the action when there is nothing to act on.
      return result(state, [{ type: 'openBlockMenu' }])
    case 's':
      return enterRead(state, ctx, [{ type: 'leap' }])
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
    case 'S':
      return result({ ...done, overlay: 'workspace' }, [], true, 'clear')
    case 'm':
      return result({ ...done, overlay: 'model' }, [], true, 'clear')
    case 'M':
      // A picker, not a cycle. `p` cycles the permission level because a level
      // has four fixed values in an order a reader learns; the voices are a
      // list the reader writes, and cycling nine of them is nine presses.
      return result({ ...done, overlay: 'mode' }, [], true, 'clear')
    case 'f':
      return result({ ...done, overlay: 'search' }, focusFor('search'), true, 'clear')
    case 'n':
      return result({ ...done, overlay: null }, [{ type: 'newThread' }], true, 'clear')
    case 'x':
      return result({ ...done, overlay: null }, [{ type: 'closeThread' }], true, 'clear')
    case 't':
      return result(done, [{ type: 'openTerminal' }], true, 'clear')
    case 'c':
      return result(done, [{ type: 'compact' }], true, 'clear')
    case 'p':
      // This thread's level, not the workspace's — the workspace has a screen
      // of its own, and a chord that quietly changed every thread would be a
      // very expensive keystroke.
      return result(done, [{ type: 'cyclePermission' }], true, 'clear')
    case 'd':
      // The same door as the bare `d`, so the which-key bar can teach it to a
      // reader who has not learnt the letter yet.
      return result({ ...done, mode: 'DIFF' }, [{ type: 'openChanges' }], true, 'clear')
    case 'h':
      return result(done, [{ type: 'moveThread', delta: -1 }], true, 'clear')
    case 'l':
      return result(done, [{ type: 'moveThread', delta: 1 }], true, 'clear')
    default:
      // Unknown key (and Escape, handled earlier) simply cancels the chord.
      return result(done, [], true, 'clear')
  }
}
