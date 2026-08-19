/** Leader chords: one key, then the chord always ends.
 *
 *  Split from `keyboard.ts` on size alone — the chord is a complete idea with
 *  one entry point, so it is the seam that costs the least to read across. */

import { MODIFIER_KEYS, type KeyContext, type KeyResult, type KeyState } from './keyboard-types'
import { digitFor, focusFor, result } from './keyboard-shared'

export function reduceLeader(state: KeyState, key: string, ctx: KeyContext): KeyResult {
  // Shift on its own is not a key a chord can mean anything by. Read as one, it
  // cancelled the chord before the capital arrived: `␣S` and `␣M` were untypable.
  if (MODIFIER_KEYS.has(key)) return result(state, [], false)

  const done: KeyState = { ...state, mode: 'OCARINA' }

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
      // Files, not threads: `/` already opens the thread search, and a chord
      // that duplicated it was a chord doing nothing new (spec D4).
      return result({ ...done, overlay: 'filefind' }, focusFor('filefind'), true, 'clear')
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
