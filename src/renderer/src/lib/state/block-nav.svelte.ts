/** How the keyboard drives the transcript: the ring, the page, the hints, and
 *  the menu key.
 *
 *  Split out of `ShellState` because it answers a different question. The shell
 *  owns the modal model — which mode, which overlay, who gets the key. This
 *  owns what happens inside one column once the key has arrived. */

import { navBlocks } from '../blocks'
import { MODIFIER_KEYS, SCROLL_STEP, type KeyEventLike } from '../keyboard'
import { app } from './app.svelte'
import { blockElement, blockFocus, revealBlock } from './block-focus.svelte'
import { blockMenu } from './block-menu.svelte'
import { scrollColumn } from './columns'
import { threads } from './threads.svelte'
import { toolOpen } from './tool-open.svelte'

/** How many `j` presses a half-page press is worth to a column that scrolls by
 *  a step rather than to a block. */
const PAGE_MULTIPLE = 5

class BlockNav {
  get leaping(): boolean {
    return blockFocus.leap !== null
  }

  /** The nav list of the focused thread. Rebuilt per keypress rather than
   *  cached: a keypress is not a hot path, and a stale list would point at
   *  blocks a restore has taken away. */
  #list(threadId = app.thread.id): ReturnType<typeof navBlocks> {
    return navBlocks(threads.get(threadId).blocks)
  }

  /** `esc` out of READ. The ring goes; the dim goes with it. */
  release(): void {
    blockFocus.clear(app.thread.id)
  }

  /** The composer took the caret, by mouse rather than by `i`. It means the
   *  same thing: the reader has stopped reading, so the transcript gets its
   *  plain look back rather than sitting half-dimmed behind a live caret. */
  startTyping(): void {
    app.mode = 'INSERT'
    this.release()
  }

  /** READ describes one column's transcript, so it cannot outlive the focus.
   *
   *  Called after every keystroke and whenever a column is clicked: a digit, a
   *  leader chord and `t` all change which column is focused without going
   *  near the transcript keys, and a mode chip that disagrees with what the
   *  keys do is worse than no chip at all. */
  reconcileMode(): void {
    if (app.mode !== 'READ') return
    if (app.thread.terminal || blockFocus.idOf(app.thread.id) === null) app.mode = 'NORMAL'
  }

  /** Everything a closed column was remembering. */
  forget(threadId: string): void {
    blockFocus.forget(threadId)
    toolOpen.forget(threadId)
    if (blockMenu.threadId === threadId) blockMenu.close()
  }

  /** Closes a menu or a set of hints that no longer has anything under it.
   *
   *  Both are modal and both swallow keys, so either one left pointing at a
   *  column the reader has moved away from — or at a block a restore has taken
   *  — would eat every keystroke from behind a surface that is not drawn. */
  dropStaleOverlays(): void {
    const here = app.thread.id

    if (blockMenu.open) {
      const block = blockMenu.block
      // Drawn, not merely present: a compaction folds the blocks above it out
      // of the rendered list while leaving them in the model, so membership
      // alone would keep a menu open on a block nobody can see.
      const gone =
        blockMenu.threadId !== here ||
        block === null ||
        blockElement(blockMenu.threadId, block.id) === undefined ||
        !this.#list(blockMenu.threadId).some((entry) => entry.id === block.id)
      if (gone) blockMenu.close()
    }

    const leap = blockFocus.leap
    if (leap !== null && leap.threadId !== here) blockFocus.cancelLeap()
  }

  /** `l` and `h` in READ. A tool row opens and closes; anything else has
   *  nothing to widen, and the key does nothing rather than something
   *  surprising. */
  expandBlock(open: boolean): void {
    const threadId = app.thread.id
    const navId = blockFocus.idOf(threadId)
    if (navId === null) return

    const block = this.#list(threadId).find((entry) => entry.id === navId)
    if (!block || block.rowId === undefined) return

    toolOpen.set(threadId, navId, open)
    // Opening a body makes the block taller, and the ring should not be pushed
    // off the bottom of the view by its own contents.
    if (open) revealBlock(threadId, navId)
  }

  /** One key while hints are on screen. Always consumed: a keystroke that fell
   *  through to a binding would move the very ring the reader is aiming. */
  handleLeapKey(event: KeyEventLike): boolean {
    // A bare modifier is not an answer, and neither is a chord: reaching for
    // a capital, or for ⌘K, must not silently throw the hints away.
    if (MODIFIER_KEYS.has(event.key)) return false
    if (event.key === 'Escape' || event.metaKey || event.ctrlKey || event.altKey) {
      blockFocus.cancelLeap()
      return true
    }

    // Labels are single characters. Anything longer is a named key — an arrow,
    // a function key — which no label can be, so it ends the mode.
    if (event.key.length !== 1) blockFocus.cancelLeap()
    else blockFocus.typeLeap(event.key)
    return true
  }

  /** `a`. Opens the menu on the focused block, and does nothing when there is
   *  no block to act on — a shell, or a column nobody has navigated. */
  openBlockMenu(): void {
    if (app.thread.terminal) return

    const threadId = app.thread.id
    const navId = blockFocus.idOf(threadId)
    if (navId === null) return

    const block = this.#list(threadId).find((entry) => entry.id === navId)
    if (!block) return

    blockMenu.openOn(threadId, block)
  }

  /** `s`. Labels what the reader can see, so the next key is a destination. */
  leap(): void {
    if (app.thread.terminal) return
    blockFocus.startLeap(app.thread.id, this.#list())
  }

  /** `j` and `k`. A thread column moves its block ring; a shell has no blocks,
   *  so it scrolls the way it always did. */
  moveBlock(delta: number): void {
    if (app.thread.terminal) {
      scrollColumn(app.thread.id, delta * SCROLL_STEP)
      return
    }

    blockFocus.move(app.thread.id, this.#list(), delta)
  }

  /** `ctrl-d` and `ctrl-u`. A shell has no blocks to land on, so it scrolls by
   *  the same magnitude instead — half a screen either way. */
  page(delta: number): void {
    if (app.thread.terminal) {
      scrollColumn(app.thread.id, delta * SCROLL_STEP * PAGE_MULTIPLE)
      return
    }

    blockFocus.page(app.thread.id, this.#list(), delta)
  }
}

export const blockNav = new BlockNav()
