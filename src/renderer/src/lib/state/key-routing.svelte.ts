/** Which surface answers a key before the strip does.
 *
 *  Every modal is asked in order, and the order is the ranking: a key that fell
 *  through to a column would move the thing the reader is looking at from
 *  behind the question they are answering. One place decides it, so a new
 *  surface cannot quietly insert itself above the others.
 *
 *  Returns whether the key was consumed, or null when nothing here wanted it
 *  and the strip's own bindings should run. */

import { app } from './app.svelte'
import { askKeys } from './ask-keys.svelte'
import { changes } from './changes.svelte'
import { commit } from './commit.svelte'
import { confirm } from './confirm.svelte'
import { sweep } from './sweep.svelte'
import { worktreeAsk } from './worktree-ask.svelte'
import type { KeyEventLike } from '../keyboard'

export function routeToOverlay(event: KeyEventLike): boolean | null {
  // The destructive modal outranks everything, including the close confirm.
  if (confirm.pending) return confirm.handleKey(event)
  // The worktree question is modal for the same reason: it is answered
  // before a thread exists, and a key that fell through would move a column
  // behind it.
  if (worktreeAsk.open) return worktreeAsk.handleKey(event)
  // The sweep is a list of directories with a removal key in it. Same rank:
  // a key falling through would move a column behind it.
  if (sweep.open) return sweep.handleKey(event)
  // The commit card owns its keys while it is open, for the same reason.
  if (commit.open) return commit.handleKey(event)

  // The viewer is modal and floats over everything: while it is up it owns
  // every key, which is what lets a filter be `/` and a jump be `gg` without
  // colliding with the bindings underneath.
  if (changes.open) return changes.handleKey(event)

  // A question waiting in this column owns the choice keys, below the modals
  // above and above ordinary column keys. `enter` from NORMAL takes them
  // back after an `esc` released them.
  if (event.key === 'Enter' && app.mode === 'NORMAL' && askKeys.resume()) return true
  if (askKeys.handleKey(event)) return true

  return null
}
