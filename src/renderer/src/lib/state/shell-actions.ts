/** Running one action the keyboard produced.
 *
 *  Split from the shell because it answers a different question. The shell
 *  owns the keyboard's *state* — the mode, the overlay, the leader chord — and
 *  this is the flat list of things a key can cause, most of which belong to
 *  some other module entirely. Keeping them together made one file that was
 *  both the state machine and the switchboard.
 *
 *  The few actions that need the shell itself take it as a small interface, so
 *  this module can be read without reading the shell.
 */

import type { Action } from '../keyboard-types'
import { agentPeek } from './agent-peek.svelte'
import { app } from './app.svelte'
import { askKeys } from './ask-keys.svelte'
import { blockMenu, copyText } from './block-menu.svelte'
import { blockNav } from './block-nav.svelte'
import { catalog } from './catalog.svelte'
import { changes } from './changes.svelte'
import { commit } from './commit.svelte'
import { following } from './following.svelte'
import { newestCodeBlock } from '../thread'
import { permission } from './permission.svelte'
import { reasoningOpen } from './reasoning.svelte'
import { sweep } from './sweep.svelte'
import { termMode } from './term-mode.svelte'
import { threadGit } from './thread-git.svelte'
import { threads } from './threads.svelte'

/** What running an action needs from the shell it belongs to. */
export interface ShellHost {
  focusComposer: () => void
  newThread: () => void
  requestClose: () => void
  moveColumn: (delta: number) => void
  targets: { composer?: HTMLElement | null; palette?: HTMLElement | null; switcher?: HTMLElement | null }
}

export function runAction(shell: ShellHost, action: Action): void {
  switch (action.type) {
    case 'goWorkspace':
      app.goWorkspace(action.index)
      break
    case 'moveThread':
      app.moveThread(action.delta)
      break
    case 'moveBlock':
      blockNav.moveBlock(action.delta)
      break
    case 'scroll':
      blockNav.scroll(action.delta)
      break
    case 'leap':
      blockNav.leap()
      break
    case 'openChanges': {
      // A shell has no files to change, and a thread nobody has prompted has
      // not changed any. Both would open a modal viewer over nothing, and a
      // modal owns every key — so the mode goes straight back instead.
      const changed = app.threadId
      if (changed === null) app.mode = 'NORMAL'
      else void changes.show(changed)
      break
    }
    case 'openBlockMenu':
      blockNav.openBlockMenu()
      break
    case 'expandBlock':
      blockNav.expandBlock(action.open)
      break
    case 'focusComposer':
      // `i` means "start typing at the focused column". For a shell that is
      // TERM, not the composer — which is not even on screen.
      if (app.thread.terminal) termMode.enter()
      else {
        // A half-dimmed transcript behind a live caret reads as broken. The
        // reader has stopped navigating; give the column its plain look back.
        blockNav.release()
        shell.focusComposer()
      }
      break
    case 'blurComposer':
      shell.targets.composer?.blur()
      break
    case 'focusPalette':
      queueMicrotask(() => shell.targets.palette?.focus())
      break
    case 'focusSwitcher':
      queueMicrotask(() => shell.targets.switcher?.focus())
      break
    case 'compact': {
      // Nothing to summarise on a column with no transcript. `␣c` over the
      // shell or the placeholder used to reject in main and write the error
      // onto a box nothing draws.
      const summarised = app.threadId
      if (summarised) threads.compact(summarised)
      break
    }
    case 'cyclePermission':
      void permission.cycleThread()
      break
    case 'yank':
      void yankNewestCodeBlock()
      break
    case 'newThread':
      shell.newThread()
      break
    case 'closeThread':
      shell.requestClose()
      break
    case 'openTerminal':
      termMode.open()
      break
    case 'jumpToLive':
      following.jump(app.thread.id)
      break
    case 'toggleReasoning':
      reasoningOpen.toggleAll()
      // The ring may have been standing on a thought that is now gone. Left
      // there it points at nothing, and the next `j` starts over from the
      // top of the thread.
      blockNav.settleFocus()
      break
    case 'termEscape':
      termMode.escape()
      break
    case 'moveColumn':
      shell.moveColumn(action.delta)
      break
    case 'pinWorkspace':
      // Failure lands on `catalog.error`, which the welcome screen renders.
      void catalog.pin()
      break
  }
}

/** Copies the focused thread's newest fenced block. A thread with no code is
 *  not an error — `y` simply has nothing to take, and says nothing. */
async function yankNewestCodeBlock(): Promise<void> {
  const code = newestCodeBlock(threads.get(app.thread.id).blocks)
  if (code === null) return

  await copyText(code)
}
