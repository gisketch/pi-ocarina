/** TERM mode: opening a workspace's shell, and leaving it again.
 *
 *  Split out of `ShellState` because it is the one binding that hands every
 *  later keystroke to something outside the app. Its rules — a shell you asked
 *  for is a shell you meant to type into, and `esc esc` means "send a real
 *  escape through" — are about the pty, not about the shell's modal model. */

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { terminals } from './terminal.svelte'
import { terminalId } from '../types'

/** How long after leaving TERM a second `esc` still means "send it through".
 *
 *  Measured against a person deliberately double-tapping, not a machine: half a
 *  second is comfortable to hit on purpose and still short enough that an
 *  unrelated later `esc` is not mistaken for the second half of a chord. */
const TERM_ESCAPE_WINDOW_MS = 500

/** What a real escape key sends, for the TUIs that need one. */
const ESCAPE = String.fromCharCode(27)

class TermMode {
  #lastEscape = 0

  /** Brings the workspace's shell up, or jumps to it if it is already there.
   *
   *  Landing in TERM is the point: a shell you asked for is a shell you meant
   *  to type into, the same reasoning that focuses the composer on leader-n. */
  open(): void {
    if (catalog.source !== 'live') return

    const workspaceId = app.workspace.id
    const id = terminalId(workspaceId)
    const existing = app.workspace.threads.findIndex((thread) => thread.id === id)

    if (existing !== -1) {
      app.focusThread(existing)
      this.enter()
      // A shell the user exited leaves its column behind. `create` is a no-op
      // while one is running, so asking again is how you get a live shell back
      // without closing the column first.
      void terminals.create(id, workspaceId).catch(() => {})
      return
    }

    catalog.openTerminal(workspaceId)
    // A shell that cannot start is the documented native-module failure. The
    // column goes away again rather than sitting blank forever in TERM.
    void terminals.create(id, workspaceId).catch((cause: unknown) => {
      catalog.failColumn(terminalId(workspaceId), cause)
      // Checked on the mode, not the column: the column has just been taken
      // away, so asking whether a terminal is focused always says no.
      if (app.mode === 'TERM') app.mode = 'OCARINA'
    })

    const column = app.workspace.threads.findIndex((thread) => thread.id === id)
    if (column === -1) return
    app.focusThread(column)
    this.enter()
  }

  /** Every route into TERM goes through here. */
  enter(): void {
    // A timestamp left armed from an earlier exit would turn the next single
    // escape into a literal one.
    this.#lastEscape = 0
    app.mode = 'TERM'
  }

  /** `esc` left TERM. A second one straight after means the person wanted the
   *  shell to see an escape — vim and lazygit both need one, and the mode key
   *  had already eaten it. */
  escape(): void {
    // Escape is reported from every mode so the second half of the chord is
    // seen; only a focused shell can mean anything by it.
    if (!app.thread.terminal) {
      this.#lastEscape = 0
      return
    }

    const now = Date.now()
    const since = now - this.#lastEscape
    // A negative gap is not a fast second press — it is a clock that moved
    // backwards. Treating it as one would send an escape nobody asked for.
    const doubled = since >= 0 && since < TERM_ESCAPE_WINDOW_MS
    this.#lastEscape = doubled ? 0 : now
    if (!doubled) return

    if (!app.thread.terminal) return
    terminals.write(app.thread.id, ESCAPE)
    app.mode = 'TERM'
  }
}

export const termMode = new TermMode()
