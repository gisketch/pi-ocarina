/** How the keyboard drives the transcript: the ring, the page, the hints, and
 *  the menu key.
 *
 *  Split out of `ShellState` because it answers a different question. The shell
 *  owns the modal model — which mode, which overlay, who gets the key. This
 *  owns what happens inside one column once the key has arrived. */

import { navBlocks } from '../blocks'
import { visibleBlocks } from '../thread-rows'
import { groupShown } from '../ledger-groups'
import { accordionShown, lastTurnIdOf, turnResolved } from '../turn-accordion'
import { foldChain } from '../folds'
import { MODIFIER_KEYS, SCROLL_STEP, type KeyEventLike } from '../keyboard'
import { isVimMode } from '../types'
import { app } from './app.svelte'
import { blockElement, blockFocus, revealBlock } from './block-focus.svelte'
import { dashboardRecent } from './dashboard-recent.svelte'
import { leap } from './leap.svelte'
import { blockMenu } from './block-menu.svelte'
import { changes } from './changes.svelte'
import { scrollColumn } from './columns'
import { pageColumn } from './paging'
import { threads } from './threads.svelte'
import { toolOpen } from './tool-open.svelte'
import { drafts } from './drafts.svelte'
import { following } from './following.svelte'
import { reasoningOpen } from './reasoning.svelte'

/** How many `j` presses a half-page press is worth to a column that scrolls by
 *  a step rather than to a block. */

class BlockNav {
  get leaping(): boolean {
    return leap.active
  }

  /** The nav list of the focused thread. Rebuilt per keypress rather than
   *  cached, so it can never point at blocks a restore has taken away — the
   *  rebuild is cheap because everything expensive under it (the markdown
   *  parse, the thinking filter) is memoized at its own seam. */
  #list(threadId = app.thread.id): ReturnType<typeof navBlocks> {
    const blocks = threads.get(threadId).blocks
    // A hidden thought is not drawn, so it is not somewhere `j` can go: a ring
    // on nothing is a key that appears to do nothing.
    const visible = reasoningOpen.shown ? blocks : visibleBlocks(blocks)

    // The accordion callback is the same rule `ThreadView` draws with — the
    // shared-seam contract: a stop the transcript does not draw is a `j` that
    // appears to do nothing.
    const model = threads.get(threadId)
    const lastTurn = lastTurnIdOf(visible)
    return navBlocks(
      visible,
      (navId, group) =>
        groupShown(group, (fallback) => toolOpen.isOpen(threadId, navId, fallback)),
      {
        resolved: (turn) => turnResolved(turn, lastTurn, model.runState),
        open: (navId, turn) =>
          accordionShown(turn, turnResolved(turn, lastTurn, model.runState), (fallback) =>
            toolOpen.isOpen(threadId, navId, fallback),
          ),
      },
    )
  }

  /** Moves the ring off a block that is no longer there.
   *
   *  Called when something takes blocks out of the transcript under it — `o`
   *  hiding every thought, today. A ring left on a missing id is not merely
   *  invisible: the next `j` cannot find it in the list and starts over from
   *  the top of the thread. */
  settleFocus(threadId = app.thread.id): void {
    const navId = blockFocus.idOf(threadId)
    if (navId === null) return
    if (this.#list(threadId).some((entry) => entry.id === navId)) return

    blockFocus.clear(threadId)
  }

  /** `esc` out of READ. The ring goes; the dim goes with it. */
  release(): void {
    blockFocus.clear(app.thread.id)
  }

  /** The composer took the caret, by mouse rather than by `i`. It means the
   *  same thing: the reader has stopped reading, so the transcript gets its
   *  plain look back rather than sitting half-dimmed behind a live caret. */
  startTyping(): void {
    app.mode = 'CHAT'
    this.release()
  }

  /** READ describes one column's transcript, so it cannot outlive the focus.
   *
   *  Called after every keystroke and whenever a column is clicked: a digit, a
   *  leader chord and `t` all change which column is focused without going
   *  near the transcript keys, and a mode chip that disagrees with what the
   *  keys do is worse than no chip at all. */
  reconcileMode(): void {
    // Vim's modes belong to a focused buffer column. A click that moves focus
    // elsewhere leaves NORMAL/INSERT pointing at nothing — every key then
    // goes to an editor that no longer has them, which reads as a dead
    // keyboard. The strip takes the mode back with the focus.
    if (isVimMode(app.mode) && app.thread.file === undefined) {
      app.mode = 'OCARINA'
      return
    }

    if (app.mode !== 'READ') return
    // A leap is READ without a ring yet: the reader is choosing where it will
    // go. Reconciling mid-leap would drop the mode the leap is running in.
    if (leap.active) return
    if (app.thread.terminal || blockFocus.idOf(app.thread.id) === null) app.mode = 'OCARINA'
  }

  /** Everything a closed column was remembering. */
  forget(threadId: string): void {
    if (leap.activeFor(threadId)) leap.end()
    // The viewer is modal and owns every key. Left open on a column that has
    // gone, it would swallow the keyboard with nothing behind it to act on.
    if (changes.threadId === threadId) {
      changes.close()
      app.mode = 'OCARINA'
    }
    blockFocus.forget(threadId)
    drafts.forget(threadId)
    toolOpen.forget(threadId)
    following.forget(threadId)
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
      const menuThread = blockMenu.threadId
      const gone =
        menuThread === null ||
        menuThread !== here ||
        block === null ||
        blockElement(menuThread, block.id) === undefined ||
        !this.#list(menuThread).some((entry) => entry.id === block.id)
      if (gone) blockMenu.close()
    }

    if (leap.active && !leap.activeFor(here)) leap.end()
  }

  /** `l` and `h` in READ.
   *
   *  `l` opens the focused row, group, or turn header — what is pointed at.
   *  `h` closes the nearest *open* fold at or around the ring, vim's `zc`:
   *  the row's own body, then the group the row sits in, then the turn — so
   *  `h` on a grandchild closes its parent, never the whole turn while the
   *  parent still stands. On anything with no open fold around it, the key
   *  does nothing rather than something surprising. */
  expandBlock(open: boolean): void {
    const threadId = app.thread.id
    const navId = blockFocus.idOf(threadId)
    if (navId === null) return

    const entry = this.#list(threadId).find((one) => one.id === navId)
    if (!entry) return

    if (open) {
      if (entry.rowId === undefined) return
      toolOpen.set(threadId, navId, true)
      // Opening a body makes the block taller, and the ring should not be
      // pushed off the bottom of the view by its own contents.
      revealBlock(threadId, navId)
      return
    }

    const model = threads.get(threadId)
    const visible = reasoningOpen.shown ? model.blocks : visibleBlocks(model.blocks)
    const lastTurn = lastTurnIdOf(visible)

    for (const fold of foldChain(visible, entry)) {
      const shown =
        fold.kind === 'row'
          ? toolOpen.isOpen(threadId, fold.navId, fold.row.open ?? false)
          : fold.kind === 'group'
            ? groupShown(fold.group, (fallback) =>
                toolOpen.isOpen(threadId, fold.navId, fallback),
              )
            : accordionShown(
                fold.turn,
                turnResolved(fold.turn, lastTurn, model.runState),
                (fallback) => toolOpen.isOpen(threadId, fold.navId, fallback),
              )
      if (!shown) continue

      toolOpen.set(threadId, fold.navId, false)
      if (fold.navId !== navId) {
        // The fold that closed took the ring's row with it; the ring moves to
        // the header that now stands for that work.
        blockFocus.set(threadId, fold.navId)
        revealBlock(threadId, fold.navId)
      }
      return
    }
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

    // On a dashboard the destination is a recent row: the leap moves the
    // selection bar and stops there, because opening is `enter`'s meaning —
    // the same contract the ring has everywhere else. No READ either; a
    // launcher has no transcript to dim.
    if (app.thread.fresh === true && app.thread.id === threadId) {
      dashboardRecent.select(app.workspace.id, target.navId)
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
    // A shell and a placeholder both draw no transcript, so neither has a
    // block for the menu to open on.
    const threadId = app.threadId
    if (threadId === null) return

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

  /** `G`'s second half: the ring lands on the newest block, so the next `j`
   *  or `k` continues from where the jump left the reader — not from a block
   *  they were on screens ago, which the reveal would yank the view back to.
   *
   *  Only when a ring is out. A reader who never started navigating gets the
   *  jump and nothing else; the first `j`/`k` already starts from the view. */
  focusLatest(): void {
    const threadId = app.thread.id
    if (app.thread.terminal) return
    if (blockFocus.idOf(threadId) === null) return

    const list = this.#list(threadId)
    const last = list[list.length - 1]
    if (last) blockFocus.set(threadId, last.id)
  }

  /** `ctrl-d` and `ctrl-u`. Moves the view and nothing else: no ring, no dim,
   *  no mode, in any mode. Skimming is not navigating.
   *
   *  Half the column, measured against a block on screen rather than against
   *  `scrollTop`. The two are not the same distance here. A transcript
   *  virtualizes, so the blocks above the fold are estimates until they are
   *  measured, and the browser's own scroll anchoring shifts `scrollTop` to
   *  hold the visible content still while those estimates are corrected —
   *  which is exactly the correction an absolute target overwrites. The result
   *  was a chord that moved a third of a page one press and three pages the
   *  next, and an up that no single down could undo.
   *
   *  Against a real element the arithmetic is honest: the block ends up half a
   *  column from where it was, whatever happened to the estimates above it, so
   *  a press up and a press down cancel exactly.
   *
   *  A shell's buffer belongs to xterm and is not DOM overflow, so it keeps
   *  its own scroller and a fixed step — there is no height here to halve. */
  scroll(delta: number): void {
    pageColumn(app.thread.id, this.#list(), delta, app.mode === 'READ')
  }
}

export const blockNav = new BlockNav()
