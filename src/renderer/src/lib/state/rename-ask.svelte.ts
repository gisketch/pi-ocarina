/** The rename dialog: one field, one thread, answered from the keyboard.
 *
 *  Modal for the same reason the worktree question is — a key that fell
 *  through would move a column behind the field the reader is typing into.
 *  Shaped like `worktreeAsk`: state here, drawing in `RenameAsk.svelte`, keys
 *  routed by the shell's modal gate.
 *
 *  The write goes to the backend, which appends the name to pi's session file
 *  — the same place the listing reads. The catalog is updated optimistically
 *  so the header answers the keystroke, and the `titled` event confirms it. */

import type { ThreadId } from '../../../../shared/thread-id'
import { session } from '../session'
import { catalog } from './catalog.svelte'

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/** The longest name worth writing; the header truncates past it anyway. */
const TITLE_MAX = 80

class RenameAsk {
  open = $state(false)
  title = $state('')
  /** True while the prefill stands whole, the way a file rename opens with the
   *  name selected: the first character replaces it, Backspace clears it.
   *  Without this the dialog opened already at the length cap whenever the
   *  header showed the 80-char first-line fallback — and no key could land. */
  pristine = $state(false)
  /** True while the backend writes. Brief, but `enter enter` must not send
   *  the rename twice. */
  pending = $state(false)
  failure = $state<string | null>(null)

  #threadId: ThreadId | null = null

  get ready(): boolean {
    return this.title.trim() !== '' && !this.pending
  }

  /** Opens on a thread, prefilled with what the header shows now — a rename
   *  usually edits a name rather than starting from nothing. */
  run(threadId: ThreadId, current: string): void {
    if (this.open) return

    this.open = true
    this.pending = false
    this.failure = null
    this.title = current.slice(0, TITLE_MAX)
    this.pristine = this.title !== ''
    this.#threadId = threadId
  }

  #close(): void {
    this.open = false
    this.pending = false
    this.failure = null
    this.title = ''
    this.pristine = false
    this.#threadId = null
  }

  async #submit(): Promise<void> {
    const threadId = this.#threadId
    const title = this.title.trim()
    if (!threadId || title === '' || this.pending) return

    this.pending = true
    this.failure = null
    try {
      await session.invoke('renameThread', { threadId, title })
      // The event confirms it; this makes the header answer the keystroke.
      catalog.retitle(threadId, title)
      this.#close()
    } catch (cause) {
      this.pending = false
      this.failure = cause instanceof Error ? cause.message : String(cause)
    }
  }

  /** One key while the field is up. Always consumed except a bare modifier. */
  handleKey(event: { key: string }): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false
    if (this.pending) return true

    if (event.key === 'Escape') {
      this.#close()
      return true
    }
    if (event.key === 'Enter') {
      if (this.ready) void this.#submit()
      return true
    }
    if (event.key === 'Backspace') {
      this.title = this.pristine ? '' : this.title.slice(0, -1)
      this.pristine = false
      return true
    }
    if (event.key.length === 1) {
      if (this.pristine) this.title = event.key
      else if (this.title.length < TITLE_MAX) this.title += event.key
      this.pristine = false
      return true
    }
    return true
  }

  /** The pointer's answers, for the two buttons. */
  cancel(): void {
    if (!this.pending) this.#close()
  }

  take(): void {
    if (this.ready) void this.#submit()
  }
}

export const renameAsk = new RenameAsk()
