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

import type { ThreadId } from '../../../../shared/thread-id'
import type { ChangedFile } from '../../../../shared/protocol'
import { session } from '../session'
import { app } from './app.svelte'
import type { KeyEventLike } from '../keyboard'
import { MODIFIER_KEYS } from '../keyboard'
import { decodePress, effectiveKey, EMPTY_KEYMAP, encodePress, type Keymap } from '../keymap'
import { fuzzyFilter } from '../fuzzy'

export type Pane = 'files' | 'diff'

/** Which changed file a tool row's target names, or -1.
 *
 *  The row carries the path pi used — relative to the workspace, or absolute —
 *  and the entries carry theirs relative to the workspace. A suffix match alone
 *  is not enough twice over: it must fall on a segment boundary, or `src/a.ts`
 *  matches `vendor/src/a.ts`; and when several entries match, the longest one
 *  is the answer, or a repository holding both files opens the wrong one. */
export function fileFor(target: string, paths: readonly string[]): number {
  let best = -1
  for (let at = 0; at < paths.length; at += 1) {
    const path = paths[at]
    if (target !== path && !target.endsWith(`/${path}`)) continue
    if (best === -1 || path.length > paths[best].length) best = at
  }
  return best
}

class Changes {
  /** Every changed file, newest last. Raw: the list is replaced wholesale. */
  files = $state.raw<ChangedFile[]>([])
  threadId = $state<string | null>(null)
  loading = $state(false)
  /** Set when the backend could not answer. Held apart from an empty list: a
   *  thread that changed nothing and a thread we could not ask about look the
   *  same in the data and mean opposite things to a reader. */
  error = $state<string | null>(null)
  pane = $state<Pane>('files')
  /** Index into `shown`, not into `files`: a filter changes what is reachable. */
  at = $state(0)
  /** Which line of the focused file's diff the reader is on. */
  line = $state(0)
  filter = $state('')
  /** The mode the viewer was opened from, so `esc` gives it back. A reader who
   *  was walking blocks in READ and looked at the change is still reading. */
  #from: 'NORMAL' | 'READ' = 'NORMAL'
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
  async show(threadId: ThreadId, path?: string): Promise<void> {
    this.#from = app.mode === 'READ' ? 'READ' : 'NORMAL'
    this.threadId = threadId
    this.loading = true
    this.error = null
    this.pane = 'files'
    this.filter = ''
    this.filtering = false
    this.line = 0

    try {
      const { files } = await session.invoke('listChanges', { threadId })
      // A second open, or a column change, can land while this was in flight.
      if (this.threadId !== threadId) return
      this.files = files
      // Exact, or a path that ends on a segment boundary. `endsWith` alone
      // matches `vendor/src/a.ts` against `src/a.ts` and opens the wrong file.
      const wanted = path === undefined ? -1 : fileFor(path, files.map((file) => file.path))
      this.at = wanted === -1 ? 0 : wanted
      if (wanted !== -1) this.pane = 'diff'
    } catch (cause) {
      if (this.threadId !== threadId) return
      this.files = []
      this.error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      this.loading = false
    }
  }

  /** `esc`: closes, and hands the keyboard back to where it came from. */
  leave(): void {
    const from = this.#from
    this.close()
    app.mode = from
  }

  close(): void {
    this.threadId = null
    this.#from = 'NORMAL'
    this.files = []
    this.error = null
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

  /** Re-reads the thread's changes while the viewer is watching it.
   *
   *  Called when a tool call ends, which is the only moment anything knows a
   *  file may have moved — the same signal the git summary refreshes on. A
   *  viewer left open beside a working agent otherwise shows the change as it
   *  was when it opened. */
  async refreshFor(threadId: ThreadId): Promise<void> {
    if (this.threadId !== threadId) return

    try {
      const { files } = await session.invoke('listChanges', { threadId })
      if (this.threadId !== threadId) return
      this.absorb(files)
    } catch {
      // The viewer already has a list. Replacing it with an error because a
      // refresh failed would take away what the reader was reading.
    }
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
   *  would move the column behind the surface the reader is looking at.
   *
   *  The reader's DIFF bindings are translated here, the same remap the shell
   *  applies before its reducer — except while the filter is typing, when a
   *  key is a letter and a rebind must not make one untypable. */
  handleKey(event: KeyEventLike, keymap: Keymap = EMPTY_KEYMAP): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false

    const pendingG = this.#pendingG
    this.#pendingG = false

    const key = this.filtering
      ? event.key
      : decodePress(effectiveKey(keymap, 'DIFF', encodePress(event))).key

    if (this.filtering || key === '/') {
      if (this.#filterKey(this.filtering ? event : { key })) return true
    }

    switch (key) {
      case 'Escape':
        this.leave()
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

    const found = this.#hunkIn(this.file?.lines ?? [], this.line, delta)
    if (found !== null) {
      this.line = found
      return
    }

    // Past this file's changes. The next file's first hunk, or its last when
    // walking backwards — measured from outside the file, so a file whose very
    // first line is a change is not skipped.
    const next = this.at + delta
    if (next < 0 || next >= this.shown.length) return

    this.at = next
    const lines = this.shown[next]?.lines ?? []
    const from = delta > 0 ? -1 : lines.length
    this.line = this.#hunkIn(lines, from, delta) ?? (delta > 0 ? 0 : Math.max(0, lines.length - 1))
  }

  /** The start of the next run of changed lines from `from`, or null.
   *
   *  Backwards means the *start* of the previous run, not its last line: `N`
   *  then `n` should land where `n` alone would have. */
  #hunkIn(lines: readonly { sign: string }[], from: number, delta: number): number | null {
    const changed = (at: number): boolean => lines[at]?.sign === '+' || lines[at]?.sign === '-'

    let at = from + delta
    // Out of the run the reader is standing in, before looking for the next.
    while (at >= 0 && at < lines.length && changed(at) && changed(at - delta)) at += delta
    while (at >= 0 && at < lines.length && !changed(at)) at += delta
    if (at < 0 || at >= lines.length) return null

    // Walking backwards lands on a run's last line; the reader wants its first.
    if (delta < 0) while (at > 0 && changed(at - 1)) at -= 1
    return at
  }

  async #copy(): Promise<void> {
    const line = this.file?.lines[this.line]
    if (!line) return
    await navigator.clipboard.writeText(line.text).catch(() => {})
  }
}

export const changes = new Changes()
