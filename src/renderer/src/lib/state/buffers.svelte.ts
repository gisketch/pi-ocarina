/** The open buffer columns: one file, one column (spec D5).
 *
 *  This owns what a buffer *is* — path, staleness, dirtiness, the notice its
 *  header shows — and what the `:` commands mean. The editor seam owns the
 *  text and the vim engine; the column component wires the two together and
 *  keeps DOM out of here, so all of it tests headlessly against a fake
 *  handle. */

import { app } from './app.svelte'
import { bridge } from '../bridge'
import { catalog } from './catalog.svelte'
import { describe } from './catalog-build'
import { session } from '../session'
import { toasts } from './toasts.svelte'
import { fileColumnId, isVimMode } from '../types'
import type { EditorHandle } from '../editor/editor'

/** What the column's notice line shows for a `:q` on unsaved work. The
 *  stale-write refusal comes from the backend with the same shape. */
export const UNSAVED_QUIT = 'unsaved changes — :q! to discard'

/** What a dirty buffer says while the disk moves under it (spec D7). */
export const CHANGED_ON_DISK = 'file changed on disk'
export const DELETED_ON_DISK = 'file deleted on disk — :w recreates it'

export interface BufferEntry {
  columnId: string
  workspaceId: string
  path: string
  /** What the buffer loaded or last wrote — the `:w` staleness anchor. */
  mtimeMs: number
  /** The text the column mounts its editor with. Not kept current — the
   *  editor owns the live text; this is only the mount and reload value. */
  text: string
  dirty: boolean
  /** One line under the header: a refusal, or "file changed on disk". */
  notice: string | null
  /** A `path:12` chip's landing line, held until the editor mounts and
   *  claimed by the column when it does. */
  revealLine: number | null
}

class Buffers {
  #entries = $state.raw<Record<string, BufferEntry>>({})
  /** The live editors, registered by the mounted columns. Not state: a
   *  handle is a capability, and nothing renders from it. */
  #handles = new Map<string, EditorHandle>()
  #watching = false

  /** Subscribed on the first open rather than at import, so the module costs
   *  nothing in a session that never opens a file. */
  #ensureWatching(): void {
    if (this.#watching || !bridge) return
    this.#watching = true
    bridge.files.onChanged(({ workspaceId, path, mtimeMs }) => {
      this.changed(fileColumnId(workspaceId, path), mtimeMs)
    })
  }

  get(columnId: string): BufferEntry | undefined {
    return this.#entries[columnId]
  }

  /** Opens `path` as a buffer column right of the focused column, or focuses
   *  the column it already has. Entering the buffer is the caller's move —
   *  opening shows the file, it does not take the keyboard. `line` is where
   *  a `path:12` chip pointed. */
  async open(workspaceId: string, path: string, line?: number): Promise<number | null> {
    if (catalog.source !== 'live') return null

    const columnId = fileColumnId(workspaceId, path)
    const already = this.#focus(workspaceId, columnId)
    if (already !== null) {
      if (line !== undefined) this.#reveal(columnId, line)
      return already
    }

    try {
      const read = await session.invoke('readFile', { workspaceId, path })
      if ('missing' in read) throw new Error(`not in the workspace any more: ${path}`)

      this.#entries = {
        ...this.#entries,
        [columnId]: {
          columnId,
          workspaceId,
          path,
          mtimeMs: read.mtimeMs,
          text: read.text,
          dirty: false,
          notice: null,
          revealLine: line ?? null,
        },
      }
      catalog.placeAfter(workspaceId, app.thread.id, {
        id: columnId,
        title: path,
        status: 'idle',
        meta: '',
        file: path,
      })
      this.#ensureWatching()
      void bridge?.files.watch(workspaceId, path)
      return this.#focus(workspaceId, columnId)
    } catch (cause) {
      toasts.push({ tone: 'error', text: describe(cause) })
      return null
    }
  }

  /** The column's editor, while it is mounted. A landing line that arrived
   *  before the mount is claimed here. */
  register(columnId: string, handle: EditorHandle): () => void {
    this.#handles.set(columnId, handle)
    const pending = this.#entries[columnId]?.revealLine
    if (pending != null) {
      handle.revealLine(pending)
      this.#patch(columnId, { revealLine: null })
    }
    return () => this.#handles.delete(columnId)
  }

  /** A chip pointed into a buffer that is already open. */
  #reveal(columnId: string, line: number): void {
    const handle = this.#handles.get(columnId)
    if (handle) handle.revealLine(line)
    else this.#patch(columnId, { revealLine: line })
  }

  /** Focus the editor: vim normal, or straight into insert. */
  enter(columnId: string, insert: boolean): void {
    const handle = this.#handles.get(columnId)
    if (!handle) return
    if (insert) handle.enterInsert()
    else handle.enterNormal()
  }

  /** `s` from the strip: into vim NORMAL with a leap already listening. */
  leap(columnId: string): void {
    this.#handles.get(columnId)?.enterLeap()
  }

  /** Escape from vim NORMAL: the strip takes the keyboard back. */
  blur(columnId: string): void {
    this.#handles.get(columnId)?.blur()
  }

  /** What vim says the mode is, mirrored while this column is focused. */
  mirrorMode(columnId: string, vimMode: string): void {
    if (app.thread.id !== columnId) return
    if (!isVimMode(app.mode)) return
    // Replace mode types over what is there — insert-shaped, so Escape stays
    // vim's own exit the way it is in INSERT.
    if (vimMode === 'leap') app.mode = 'LEAP'
    else if (vimMode === 'insert' || vimMode === 'replace') app.mode = 'INSERT'
    else if (vimMode === 'visual') app.mode = 'VISUAL'
    else app.mode = 'NORMAL'
  }

  setDirty(columnId: string, dirty: boolean): void {
    this.#patch(columnId, { dirty })
  }

  /** `:w`. True when the write landed; a refusal lands on the notice line
   *  and the column stays exactly as it was (spec D1). */
  async save(columnId: string, force: boolean): Promise<boolean> {
    const entry = this.#entries[columnId]
    const handle = this.#handles.get(columnId)
    if (!entry || !handle) return false

    try {
      const { mtimeMs } = await session.invoke('writeFile', {
        workspaceId: entry.workspaceId,
        path: entry.path,
        text: handle.text(),
        expectMtimeMs: force ? null : entry.mtimeMs,
      })
      handle.markClean()
      this.#patch(columnId, { mtimeMs, dirty: false, notice: null })
      return true
    } catch (cause) {
      this.#patch(columnId, { notice: describe(cause) })
      return false
    }
  }

  /** `:q`. Refuses unsaved work unless forced; a closed buffer is gone. */
  quit(columnId: string, force: boolean): void {
    const entry = this.#entries[columnId]
    if (!entry) return
    if (entry.dirty && !force) {
      this.#patch(columnId, { notice: UNSAVED_QUIT })
      return
    }
    this.close(columnId)
  }

  /** `:qa`. Clean buffers close; dirty ones stay and say why, unless forced. */
  quitAll(force: boolean): void {
    for (const entry of Object.values(this.#entries)) this.quit(entry.columnId, force)
  }

  /** The disk moved under an open buffer (spec D7). A clean buffer follows
   *  it — the reader watches pi's edits land; a dirty one holds what they
   *  typed and says so. A write of our own also wakes the watcher, and the
   *  mtime it reports is the one `save` already recorded — nothing to do. */
  async changed(columnId: string, mtimeMs: number | null): Promise<void> {
    const entry = this.#entries[columnId]
    if (!entry) return
    if (mtimeMs !== null && mtimeMs === entry.mtimeMs) return

    if (mtimeMs === null) {
      this.#patch(columnId, { notice: DELETED_ON_DISK })
      return
    }

    if (entry.dirty) {
      // The stale anchor stays where the buffer loaded: `:w` must still
      // refuse, or the reader silently overwrites what pi just wrote.
      this.#patch(columnId, { notice: CHANGED_ON_DISK })
      return
    }

    try {
      const read = await session.invoke('readFile', {
        workspaceId: entry.workspaceId,
        path: entry.path,
      })
      if ('missing' in read) {
        this.#patch(columnId, { notice: DELETED_ON_DISK })
        return
      }
      this.#handles.get(columnId)?.setText(read.text)
      this.#patch(columnId, { mtimeMs: read.mtimeMs, text: read.text, dirty: false, notice: null })
    } catch {
      // The next change event tries again; a reload that failed is a notice,
      // not a crash.
      this.#patch(columnId, { notice: CHANGED_ON_DISK })
    }
  }

  /** Takes the column away and forgets the buffer. The strip owns focus
   *  reconciliation; the mode goes back to the strip with it. */
  close(columnId: string): void {
    const entry = this.#entries[columnId]
    if (entry) void bridge?.files.unwatch(entry.workspaceId, entry.path)
    const { [columnId]: _gone, ...rest } = this.#entries
    this.#entries = rest
    this.#handles.delete(columnId)
    catalog.closeColumn(columnId)
    if (isVimMode(app.mode)) app.mode = 'OCARINA'
  }

  #patch(columnId: string, patch: Partial<BufferEntry>): void {
    const entry = this.#entries[columnId]
    if (!entry) return
    this.#entries = { ...this.#entries, [columnId]: { ...entry, ...patch } }
  }

  /** Focus the column if it is on the strip; its index, or null. */
  #focus(workspaceId: string, columnId: string): number | null {
    const workspace = catalog.workspaces.find((candidate) => candidate.id === workspaceId)
    const index = workspace?.threads.findIndex((thread) => thread.id === columnId) ?? -1
    if (index === -1 || !workspace) return null

    const at = catalog.workspaces.findIndex((candidate) => candidate.id === workspaceId)
    if (at !== -1) app.goWorkspace(at)
    app.focusThread(index)
    return index
  }
}

export const buffers = new Buffers()
