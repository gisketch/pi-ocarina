/** Which surface answers a key before the strip does.
 *
 *  Every modal is asked in order, and the order is the ranking: a key that fell
 *  through to a column would move the thing the reader is looking at from
 *  behind the question they are answering. One place decides it, so a new
 *  surface cannot quietly insert itself above the others.
 *
 *  Returns whether the key was consumed, or null when nothing here wanted it
 *  and the strip's own bindings should run. */

import { agentPeek } from './agent-peek.svelte'
import { askKeys } from './ask-keys.svelte'
import { blockMenu } from './block-menu.svelte'
import { blockNav } from './block-nav.svelte'
import { changes } from './changes.svelte'
import { commit } from './commit.svelte'
import { confirm } from './confirm.svelte'
import { keybinds } from './keybinds.svelte'
import { sweep } from './sweep.svelte'
import { renameAsk } from './rename-ask.svelte'
import { branchField } from './branch-field.svelte'
import type { KeyEventLike } from '../keyboard'
import { EMPTY_KEYMAP, type Keymap } from '../keymap'
import type { ThreadId } from '../../../../shared/thread-id'

export function routeToOverlay(event: KeyEventLike, keymap: Keymap = EMPTY_KEYMAP): boolean | null {
  // The destructive modal outranks everything, including the close confirm.
  if (confirm.pending) return confirm.handleKey(event)
  // A recording row owns the very next key — that is what recording means.
  // Above the other modals: the reader armed it a keystroke ago, and any key
  // that fell past it would both bind nothing and do something.
  if (keybinds.recording !== null) return keybinds.handleRecordKey(event)
  // The branch field reads raw letters into a name. It ranks with the
  // modals for the same reason they do: a key that fell through would move
  // a column behind the field the reader is typing into.
  if (branchField.columnId !== null) return branchField.handleKey(event)
  // The rename field is modal for the same reason.
  if (renameAsk.open) return renameAsk.handleKey(event)
  // The sweep is a list of directories with a removal key in it. Same rank:
  // a key falling through would move a column behind it.
  if (sweep.open) return sweep.handleKey(event)
  // The commit card owns its keys while it is open, for the same reason.
  if (commit.open) return commit.handleKey(event)

  // The viewer is modal and floats over everything: while it is up it owns
  // every key, which is what lets a filter be `/` and a jump be `gg` without
  // colliding with the bindings underneath.
  if (changes.open) return changes.handleKey(event, keymap)

  // A pending question is deliberately *not* here: it arrives on its own,
  // where everything above was put on screen by the reader, so it ranks below
  // the block menu and the leap hints as well. `routeToSurface` asks it after
  // those.
  return null
}

/** The surfaces that rank *below* the modals but above ordinary column keys.
 *
 *  Split from `routeToOverlay` because the ranking is the same idea and the two
 *  halves differ only in where the pending question sits. Kept out of the shell
 *  because that file is the longest in the app and this is not about the strip.
 *
 *  Returns true when the key was consumed. */
export function routeToSurface(
  event: KeyEventLike,
  mode: string,
  threadId: ThreadId | null,
): boolean {
  // A menu or a set of hints can outlive what they point at: a column can be
  // clicked away, a restore can take the block, a compaction can fold it out of
  // sight. Either would then swallow every key from behind a surface that is no
  // longer drawn, so both are dropped before anything reads the key.
  blockNav.dropStaleOverlays()

  // The block menu is a list with a highlight, and it is modal: it ranks below
  // the questions above and above the hint mode, which is not.
  if (blockMenu.open) {
    if (MODIFIER_KEYS.has(event.key)) return false
    return blockMenu.handleKey(event)
  }

  // Hints own every key while they are on screen — that is what lets a label be
  // `j` without colliding with the binding. They rank below the modals above,
  // which are asked because an answer changes work already in flight, and above
  // everything below, which is ordinary navigation.
  if (blockNav.leaping) {
    const consumed = blockNav.handleLeapKey(event)
    // A leap can end without landing — `esc`, a pattern that matched nothing, a
    // key that named no label — and those paths leave READ standing with no
    // ring. Reconciling here rather than on the next keystroke is what stops
    // that next keystroke being read as READ.
    blockNav.reconcileMode()
    return consumed
  }

  // A question waiting in this column owns the choice keys — below everything
  // the reader put on screen, above ordinary column keys. `enter` from NORMAL
  // takes them back after an `esc` released them.
  if (event.key === 'Enter' && mode === 'NORMAL' && askKeys.resume()) return true
  if (askKeys.handleKey(event)) return true

  // The peek, and the keys that reach it. Below the question, which is asked;
  // above ordinary column keys, which is what lets `l` descend into a child
  // rather than move to the next column — and only while an agent row is
  // focused, so `l` is unchanged in front of every other kind of block.
  return agentPeek.handleKey(event, mode, threadId)
}

/** A modifier pressed on its own is not an answer to anything. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])
