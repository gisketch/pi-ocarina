/** DIFF mode: every file a thread changed, and where the reader is in them.
 *
 *  Modal, like READ and TERM: while it is up it owns every key, so a label can
 *  be `j` and a filter can be `/` without colliding with the bindings
 *  underneath. It floats above the strip rather than inside a column, because a
 *  column carries paint containment and would slice it off.
 *
 *  The keys live here rather than in `keyboard.ts` for the same reason the
 *  leap's do: `gg` needs a pending state that only means something inside this
 *  mode, and the shell's reducer should not learn a second grammar. */

import type { ChangedFile } from '../../../../shared/protocol'
import { session } from '../session'
import { app } from './app.svelte'
import type { KeyEventLike } from '../keyboard'
import { MODIFIER_KEYS } from '../keyboard'
import { fuzzyFilter } from '../fuzzy'

export type Pane = 'files' | 'diff'

class Changes {
  /** Every changed file, newest last. Raw: the list is replaced wholesale. */
  files = $state.raw<ChangedFile[]>([])
  threadId = $state<string | null>(null)
  loading = $state(false)
  pane = $state<Pane>('files')
  /** Index into `shown`, not into `files`: a filter changes what is reachable. */
  at = $state(0)
  /** Which line of the focused file's diff the reader is on. */
  line = $state(0)
  filter = $state('')
  /** Whether the filter is taking keys. Held apart from the text: `/` then
   *  backspace leaves an empty filter that is still listening, and a filter
   *  that stopped listening the moment it was emptied would be unusable. */
  filtering = $state(false)
  /** Set by `g`, cleared by the key after it. Only `gg` means anything. */
  #pendingG = false

  get open(): boolean {
    return this.threadId !== null
  }

  /** The files a reader can currently reach. */
  get shown(): ChangedFile[] {
    const query = this.filter.trim()
    if (query === '') return this.files
    return fuzzyFilter(this.files, query, (file) => file.path)
  }

  get file(): ChangedFile | null {
    return this.shown[Math.min(this.at, this.shown.length - 1)] ?? null
  }

  /** Opens on a thread, optionally at a file — which is what `a` on a capped
   *  row does. */
  async show(threadId: string, path?: string): Promise<void> {
    this.threadId = threadId
    this.loading = true
    this.pane = 'files'
    this.filter = ''
    this.filtering = false
    this.line = 0

    try {
      const { files } = await session.invoke('listChanges', { threadId })
      // A second open, or a column change, can land while this was in flight.
      if (this.threadId !== threadId) return
      this.files = files
      const wanted = path === undefined ? -1 : files.findIndex((file) => path.endsWith(file.path))
      this.at = wanted === -1 ? 0 : wanted
      if (wanted !== -1) this.pane = 'diff'
    } finally {
      this.loading = false
    }
  }

  close(): void {
    this.threadId = null
    this.files = []
    // The pane goes back too. A viewer reopened into whichever pane the last
    // one was left in is a viewer whose keys mean something different each
    // time it opens.
    this.pane = 'files'
    this.filter = ''
    this.filtering = false
    this.at = 0
    this.line = 0
    this.#pendingG = false
  }

  /** New files arriving while the viewer is open must not move the reader.
   *
   *  The selection is held by path rather than by index: a file appended above
   *  the one being read would otherwise slide it out from under the cursor. */
  absorb(files: ChangedFile[]): void {
    const held = this.file?.path
    this.files = files
    if (held === undefined) return

    const found = this.shown.findIndex((file) => file.path === held)
    if (found !== -1) this.at = found
  }

  /** One key while the viewer is up. Always consumed: a key that fell through
   *  would move the column behind the surface the reader is looking at. */
  handleKey(event: KeyEventLike): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false

    const pendingG = this.#pendingG
    this.#pendingG = false

    if (this.filtering || event.key === '/') {
      if (this.#filterKey(event)) return true
    }

    switch (event.key) {
      case 'Escape':
        this.close()
        app.mode = 'NORMAL'
        return true
      case 'j':
      case 'ArrowDown':
        this.#move(1)
        return true
      case 'k':
      case 'ArrowUp':
        this.#move(-1)
        return true
      case 'Tab':
        this.pane = this.pane === 'files' ? 'diff' : 'files'
        return true
      case 'l':
      case 'ArrowRight':
        this.pane = 'diff'
        return true
      case 'h':
      case 'ArrowLeft':
        this.pane = 'files'
        return true
      case 'g':
        if (pendingG) this.#jump('top')
        else this.#pendingG = true
        return true
      case 'G':
        this.#jump('bottom')
        return true
      case 'n':
        this.#hunk(1)
        return true
      case 'N':
        this.#hunk(-1)
        return true
      case 'y':
        void this.#copy()
        return true
    }

    return true
  }

  /** The filter owns the keyboard while it has text in it, the way a spotlight
   *  does. `esc` leaves the filter, not the viewer — the reader who typed it is
   *  not asking to leave. */
  #filterKey(event: KeyEventLike): boolean {
    if (event.key === '/' && !this.filtering) {
      this.filtering = true
      return true
    }
    if (event.key === 'Escape') {
      this.filtering = false
      this.filter = ''
      this.at = 0
      return true
    }
    if (event.key === 'Enter') {
      this.filtering = false
      this.pane = 'diff'
      return true
    }
    if (event.key === 'Backspace') {
      this.filter = this.filter.slice(0, -1)
      this.at = 0
      return true
    }
    if (event.key.length === 1) {
      this.filter += event.key
      this.at = 0
      return true
    }
    return false
  }

  #move(delta: number): void {
    if (this.pane === 'files') {
      const last = this.shown.length - 1
      this.at = Math.max(0, Math.min(last < 0 ? 0 : last, this.at + delta))
      this.line = 0
      return
    }

    const last = (this.file?.lines.length ?? 1) - 1
    this.line = Math.max(0, Math.min(last < 0 ? 0 : last, this.line + delta))
  }

  #jump(to: 'top' | 'bottom'): void {
    if (this.pane === 'files') {
      this.at = to === 'top' ? 0 : Math.max(0, this.shown.length - 1)
      this.line = 0
      return
    }
    this.line = to === 'top' ? 0 : Math.max(0, (this.file?.lines.length ?? 1) - 1)
  }

  /** The next run of changed lines, crossing into the next file at the end.
   *
   *  A hunk is a run, not a line: stepping to every `+` in a block of twelve
   *  additions would make `n` mean the same as `j`. */
  #hunk(delta: number): void {
    this.pane = 'diff'
    const lines = this.file?.lines ?? []
    const changed = (at: number): boolean => lines[at]?.sign === '+' || lines[at]?.sign === '-'

    let at = this.line + delta
    // Out of the run the reader is standing in, before looking for the next.
    while (at >= 0 && at < lines.length && changed(at) && changed(at - delta)) at += delta
    while (at >= 0 && at < lines.length && !changed(at)) at += delta

    if (at >= 0 && at < lines.length) {
      this.line = at
      return
    }

    // Past the end of this file's changes: the next file, at its first hunk.
    const next = this.at + delta
    if (next < 0 || next >= this.shown.length) return
    this.at = next
    this.line = 0
    this.#hunk(delta === 1 ? 1 : -1)
  }

  async #copy(): Promise<void> {
    const line = this.file?.lines[this.line]
    if (!line) return
    await navigator.clipboard.writeText(line.text).catch(() => {})
  }
}

export const changes = new Changes()
