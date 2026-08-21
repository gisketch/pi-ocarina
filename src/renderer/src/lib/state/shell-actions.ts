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
import { branchField } from './branch-field.svelte'
import { buffers } from './buffers.svelte'
import { dashboardRecent } from './dashboard-recent.svelte'
import { catalog } from './catalog.svelte'
import { changes } from './changes.svelte'
import { commit } from './commit.svelte'
import { following } from './following.svelte'
import { newestCodeBlock } from '../thread'
import { permission } from './permission.svelte'
import { renameAsk } from './rename-ask.svelte'
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
      if (changed === null) app.mode = 'OCARINA'
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
    case 'renameThread': {
      // Only a real thread has a session file to write a name into — the
      // placeholder and the shell keep the key inert.
      const named = app.threadId
      if (named) renameAsk.run(named, app.titleOf(app.thread))
      break
    }
    case 'newThread':
      shell.newThread()
      break
    case 'dashboardMove':
      dashboardRecent.move(app.workspace.id, action.delta)
      break
    case 'dashboardOpen':
      void dashboardRecent.open(app.workspace.id)
      break
    case 'worktreeThread': {
      // Only the dashboard has the field, and only a live catalog has a git
      // to make a worktree in. Anywhere else, `b` is a letter that means
      // nothing — the same silence every unbound key gets.
      const column = app.thread
      if (column.fresh && catalog.source === 'live' && app.workspace.git !== null) {
        branchField.open(app.workspace.id, column.id)
      }
      break
    }
    case 'closeThread':
      shell.requestClose()
      break
    case 'openTerminal':
      termMode.open()
      break
    case 'jumpToLive':
      following.jump(app.thread.id)
      // The ring rides along when one is out, so navigation resumes from the
      // newest block rather than from wherever the reader left it.
      blockNav.focusLatest()
      break
    case 'toggleTurn':
      blockNav.toggleVisibleTurn()
      break
    case 'termEscape':
      termMode.escape()
      break
    case 'bufferEnter':
      buffers.enter(app.thread.id, action.insert)
      break
    case 'bufferLeap':
      buffers.leap(app.thread.id)
      break
    case 'bufferBlur':
      buffers.blur(app.thread.id)
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
