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
import { leap } from './leap.svelte'
import { blockMenu } from './block-menu.svelte'
import { changes } from './changes.svelte'
import { columnBody, scrollColumn } from './columns'
import { threads } from './threads.svelte'
import { toolOpen } from './tool-open.svelte'
import { following } from './following.svelte'
import { reasoningOpen } from './reasoning.svelte'

/** How many `j` presses a half-page press is worth to a column that scrolls by
 *  a step rather than to a block. */
const PAGE_MULTIPLE = 5

class BlockNav {
  get leaping(): boolean {
    return leap.active
  }

  /** The nav list of the focused thread. Rebuilt per keypress rather than
   *  cached: a keypress is not a hot path, and a stale list would point at
   *  blocks a restore has taken away. */
  #list(threadId = app.thread.id): ReturnType<typeof navBlocks> {
    return navBlocks(threads.get(threadId).blocks, (navId) =>
      toolOpen.isOpen(threadId, navId, false),
    )
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
    // A leap is READ without a ring yet: the reader is choosing where it will
    // go. Reconciling mid-leap would drop the mode the leap is running in.
    if (leap.active) return
    if (app.thread.terminal || blockFocus.idOf(app.thread.id) === null) app.mode = 'NORMAL'
  }

  /** Everything a closed column was remembering. */
  forget(threadId: string): void {
    if (leap.activeFor(threadId)) leap.end()
    // The viewer is modal and owns every key. Left open on a column that has
    // gone, it would swallow the keyboard with nothing behind it to act on.
    if (changes.threadId === threadId) {
      changes.close()
      app.mode = 'NORMAL'
    }
    blockFocus.forget(threadId)
    toolOpen.forget(threadId)
    following.forget(threadId)
    reasoningOpen.forget(threadId)
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

    if (leap.active && !leap.activeFor(here)) leap.end()
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

  /** One key while a leap is up. Always consumed: a keystroke that fell
   *  through to a binding would move the very focus the reader is aiming.
   *
   *  The key means a different thing in each of the mode's phases, which is
   *  the whole reason the mode has to own all of them: a searched character
   *  can be `a`, and a label can be `j`. */
  handleLeapKey(event: KeyEventLike): boolean {
    // A bare modifier is not an answer, and neither is a chord: reaching for a
    // capital, or for ⌘K, must not silently throw the search away.
    if (MODIFIER_KEYS.has(event.key)) return false
    if (event.key === 'Escape' || event.metaKey || event.ctrlKey || event.altKey) {
      leap.end()
      return true
    }

    if (event.key === 'Backspace') {
      if (leap.labelled) leap.page(-1)
      else leap.backspace()
      return true
    }

    if (event.key === ' ' && leap.labelled) {
      leap.page(1)
      return true
    }

    // Anything longer than a character is a named key — an arrow, a function
    // key — which neither a pattern nor a label can be.
    if (event.key.length !== 1) {
      leap.end()
      return true
    }

    if (leap.labelled) {
      const at = leap.resolve(event.key)
      if (at === null) leap.end()
      else this.#land(at)
      return true
    }

    const only = leap.type(event.key)
    if (only !== null) this.#land(only)
    return true
  }

  /** Focuses the block holding a match, and closes the mode. The match itself
   *  is only ever how the reader aimed; the block is the destination. */
  #land(index: number): void {
    const threadId = leap.threadId
    const target = leap.targets[index]
    leap.end()
    if (threadId === null || !target) return

    // A compaction can fold the block away between the search and the label.
    // Focusing a ghost leaves the column fully dimmed with nothing lit.
    if (blockElement(threadId, target.navId) === undefined) {
      this.reconcileMode()
      return
    }

    blockFocus.set(threadId, target.navId)
    revealBlock(threadId, target.navId)
    // A leap is a way into the transcript as well as a way around it.
    app.mode = 'READ'
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

  /** `s`. Paints nothing yet — the first character is what shows the reader
   *  whether they are aiming somewhere dense or somewhere rare. */
  leap(): void {
    if (app.thread.terminal) return
    leap.start(app.thread.id)
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

  /** `ctrl-d` and `ctrl-u` from READ. The ring pages with the view, so the
   *  reader keeps the block they were pointing at.
   *
   *  A shell has no blocks to land on, so it scrolls by the same magnitude
   *  instead — half a screen either way. */
  page(delta: number): void {
    if (app.thread.terminal) {
      this.scroll(delta)
      return
    }

    blockFocus.page(app.thread.id, this.#list(), delta)
  }

  /** `ctrl-d` and `ctrl-u` from anywhere else. Moves the view and nothing
   *  else: no ring, no dim, no mode. Skimming is not navigating.
   *
   *  Half the column, so the chord means the same distance it means in READ.
   *  A column that has not painted, and a shell — whose buffer belongs to
   *  xterm and has no height to read — fall back to a fixed step. */
  scroll(delta: number): void {
    const threadId = app.thread.id
    const height = columnBody(threadId)?.clientHeight
    const distance = height ? height / 2 : SCROLL_STEP * PAGE_MULTIPLE
    scrollColumn(threadId, delta * distance)
  }
}

export const blockNav = new BlockNav()
