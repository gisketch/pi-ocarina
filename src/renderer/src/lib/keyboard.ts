/** One reducer for every key the shell handles.
 *
 *  Pure: a key and the state in, the next state and a list of actions out. That
 *  is what makes the whole keyboard testable without a DOM, and it is why modes
 *  cannot drift — there is exactly one place a mode changes.
 *
 *  The vocabulary it speaks lives in `keyboard-types.ts`, re-exported here. */

import {
  type Action,
  type KeyContext,
  type KeyEventLike,
  type KeyResult,
  type KeyState,
  type Overlay,
} from './keyboard-types'
import { digitFor, focusFor, result } from './keyboard-shared'
import { reduceLeader } from './keyboard-leader'

export * from './keyboard-types'

/** Selecting a workspace always dismisses overlays and leaves the leader chord. */
function goWorkspace(state: KeyState, index: number): KeyResult {
  return result({ ...state, overlay: null, mode: state.mode === 'LEADER' ? 'OCARINA' : state.mode }, [
    { type: 'goWorkspace', index },
  ])
}

/** Overlays that own a text caret, or read raw letters of their own. Their
 *  input must receive every keystroke the shell would otherwise read as a
 *  binding — including the keys that open other screens. */
const TYPING_OVERLAYS: ReadonlySet<Overlay> = new Set<Overlay>([
  'palette',
  'switcher',
  'model',
  'search',
  // The thread picker is an fzf input with a preview; every letter is a
  // filter character while it is up. The file search is the same telescope.
  'threads',
  'filefind',
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
  // The Keymaps editor reads raw letters twice over: its rows answer j/k/r,
  // and a recording row must receive literally any key — including the ones
  // that open other screens.
  'keybinds',
])

/** The key each screen opens on, which is also the key that closes it again.
 *
 *  A map rather than six switch cases, because it is also the answer to "may
 *  this key still run while a screen is open" — an overlay key only ever acts
 *  on overlays, so it is the one thing that never reaches the strip behind. */
const OVERLAY_KEYS: ReadonlyMap<string, Overlay> = new Map<string, Overlay>([
  ['w', 'switcher'],
  ['?', 'keymap'],
  [',', 'settings'],
  // The shifted sibling of `,`: same key, narrower scope. Workspace settings
  // are not a section of the app's settings, so they are not reached through
  // them.
  ['<', 'workspace'],
  ['m', 'model'],
  // The shifted sibling of `m`: the model a thread answers with and the voice
  // it answers in are the same kind of choice.
  ['M', 'mode'],
  // Search, by the convention every editor and pager already taught.
  ['/', 'search'],
])

/** Reaching into the transcript. A shell has no blocks to reach into, and
 *  neither does a buffer — both keep the old behaviour and stay put. */
function enterRead(state: KeyState, ctx: KeyContext, actions: Action[]): KeyResult {
  const stays = ctx.terminalColumn || ctx.bufferColumn
  return result(stays ? state : { ...state, mode: 'READ' }, actions)
}

/** Whether something on screen owns the caret. Everything the shell would
 *  otherwise read as a binding must reach it untouched. */
function isTyping(state: KeyState): boolean {
  return state.mode === 'CHAT' || (state.overlay !== null && TYPING_OVERLAYS.has(state.overlay))
}

/** Whether anything is drawn on top of the strip.
 *
 *  A dialog is over the columns, so a key it does not use must do nothing
 *  rather than move what is behind it — the reader cannot see what it moved,
 *  and cannot see it move back. */
function occupied(state: KeyState): boolean {
  return isTyping(state) || state.overlay !== null
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
      return result({ ...state, mode: 'OCARINA' }, [{ type: 'termEscape' }], true, 'clear')
    }
    return result(state, [], false)
  }

  // Vim owns the buffer the way the pty owns the shell. In INSERT even
  // Escape is vim's — leaving insert is vim's own exit, and the mirror
  // (`onModeChange`) is what moves the app's mode back to NORMAL. That is
  // the double-escape ladder: the first escape is vim's, the second is ours.
  if (state.mode === 'INSERT' || state.mode === 'VISUAL') {
    return result(state, [], false)
  }
  if (state.mode === 'NORMAL') {
    if (key === 'Escape') {
      return result({ ...state, mode: 'OCARINA' }, [{ type: 'bufferBlur' }], true, 'clear')
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
      const back: Action[] = state.mode === 'CHAT' ? [{ type: 'focusComposer' }] : []
      return result({ ...state, overlay: null }, back, true, 'clear')
    }

    // The second half of `esc esc` lands here, not in the TERM branch above:
    // the first press already left TERM. The shell owns the timing and the
    // "is a shell even focused" question, so this always reports the press and
    // lets it decide — everywhere else it is a no-op.
    return result(
      { ...state, mode: 'OCARINA' },
      state.mode === 'CHAT' ? [{ type: 'blurComposer' }] : [{ type: 'termEscape' }],
      true,
      'clear',
    )
  }

  if (mod && key.toLowerCase() === 'k') {
    const opening = state.overlay !== 'palette'
    return result(
      { ...state, overlay: opening ? 'palette' : null, mode: state.mode === 'LEADER' ? 'OCARINA' : state.mode },
      opening ? [{ type: 'focusPalette' }] : [],
      true,
      'clear',
    )
  }

  // Half-page paging, by the convention every pager and editor already taught.
  // It has to be resolved above the bail-out below, which exists so that every
  // other control chord reaches whatever has the caret.
  //
  // It moves the view and nothing else, in every mode — the same thing a wheel
  // does, by half a column at a time. It used to carry the block ring along in
  // READ, which made one chord mean two different things depending on a mode
  // the hand cannot feel.
  if (event.ctrlKey && !event.metaKey && !event.altKey && !occupied(state)) {
    if (key === 'd') return result(state, [{ type: 'scroll', delta: 1 }])
    if (key === 'u') return result(state, [{ type: 'scroll', delta: -1 }])
  }

  if (event.altKey || mod) return result(state, [], false)

  if (state.mode === 'LEADER') return reduceLeader(state, key, ctx)

  // Everything below this line moves the strip. Typing must reach the input
  // untouched, and a screen on top of the strip owns every key it is drawn
  // over — a digit that changed workspaces from behind the settings screen
  // moved a strip the reader was not even looking at.
  if (isTyping(state)) return result(state, [], false)

  if (state.overlay !== null) {
    // One exception, and it acts on the screen rather than under it: the key
    // that opened this one closes it, and another screen's key swaps to it.
    const swap = OVERLAY_KEYS.get(key)
    return swap === undefined ? result(state, [], false) : toggleOverlay(state, swap)
  }

  const index = digitFor(key, ctx.workspaceCount)
  if (index !== null) return goWorkspace(state, index)

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
  if (key === 'd' && (state.mode === 'OCARINA' || state.mode === 'READ')) {
    return result({ ...state, mode: 'DIFF' }, [{ type: 'openChanges' }])
  }

  // Shift moves the column itself rather than the focus — the same relationship
  // a tiling window manager gives you, and it works on any column, thread or
  // terminal.
  if (key === 'H') return result(state, [{ type: 'moveColumn', delta: -1 }])
  if (key === 'L') return result(state, [{ type: 'moveColumn', delta: 1 }])

  // With nothing pinned the welcome screen is the whole app, and its one
  // action is the only thing ⏎ could mean.
  if (key === 'Enter' && ctx.workspaceCount === 0) {
    return result(state, [{ type: 'pinWorkspace' }])
  }

  // The dashboard's recent rows. j/k walk them and ⏎ opens one — without
  // entering READ, because a launcher has no transcript to dim. Above the
  // NORMAL switch, whose j/k would otherwise take the keys there.
  if (ctx.dashboardColumn) {
    if (key === 'j' || key === 'ArrowDown') return result(state, [{ type: 'dashboardMove', delta: 1 }])
    if (key === 'k' || key === 'ArrowUp') return result(state, [{ type: 'dashboardMove', delta: -1 }])
    if (key === 'Enter') return result(state, [{ type: 'dashboardOpen' }])
    // A leap over rows, not into a transcript: the mode stays NORMAL, and
    // landing moves the selection bar instead of a block ring.
    if (key === 's') return result(state, [{ type: 'leap' }])
    // The whole history, where the five recent rows run out. This shadows the
    // global content search on purpose: on a launcher, "search" means "find
    // me a thread" — the content search is still one column away.
    if (key === '/') return result({ ...state, overlay: 'threads' })
  }

  // Into the buffer (spec D3). ⏎ gives motions without typing; `i` keeps
  // meaning "start typing here" on every column kind — composer on a chat
  // column, insert on a buffer. Above the switch, whose own `i` would take
  // the key to a composer this column does not have.
  if (ctx.bufferColumn) {
    if (key === 'Enter') {
      return result({ ...state, mode: 'NORMAL' }, [{ type: 'bufferEnter', insert: false }])
    }
    if (key === 'i') {
      return result({ ...state, mode: 'INSERT' }, [{ type: 'bufferEnter', insert: true }])
    }
  }

  // Opening a screen, from NORMAL or from READ. Above the switch because the
  // same map decides which keys survive once one is open.
  const overlay = OVERLAY_KEYS.get(key)
  if (overlay !== undefined) return toggleOverlay(state, overlay)

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
    case 'i':
      return result({ ...state, mode: 'CHAT' }, [{ type: 'focusComposer' }])
    case 'a':
      // The reducer does not know whether a block is focused; the shell drops
      // the action when there is nothing to act on.
      return result(state, [{ type: 'openBlockMenu' }])
    case 's':
      return enterRead(state, ctx, [{ type: 'leap' }])
    case 'y':
      return result(state, [{ type: 'yank' }])
    // The dashboard's worktree flow. The reducer does not know which column
    // is focused; the shell drops the action when it is not a dashboard.
    case 'b':
      return result(state, [{ type: 'worktreeThread' }])
    // Shifted, like ⇧H/⇧L: the bare letters are taken, and a rename is rare
    // enough to be worth a reach.
    case 'R':
      return result(state, [{ type: 'renameThread' }])
    default:
      return result(state, [], false)
  }
}
