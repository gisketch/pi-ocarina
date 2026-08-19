/** The open buffer columns: one file, one column (spec D5).
 *
 *  This owns what a buffer *is* — path, staleness, dirtiness, the notice its
 *  header shows — and what the `:` commands mean. The editor seam owns the
 *  text and the vim engine; the column component wires the two together and
 *  keeps DOM out of here, so all of it tests headlessly against a fake
 *  handle. */

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { describe } from './catalog-build'
import { session } from '../session'
import { toasts } from './toasts.svelte'
import { fileColumnId } from '../types'
import type { EditorHandle } from '../editor/editor'

/** What the column's notice line shows for a `:q` on unsaved work. The
 *  stale-write refusal comes from the backend with the same shape. */
export const UNSAVED_QUIT = 'unsaved changes — :q! to discard'

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
}

class Buffers {
  #entries = $state.raw<Record<string, BufferEntry>>({})
  /** The live editors, registered by the mounted columns. Not state: a
   *  handle is a capability, and nothing renders from it. */
  #handles = new Map<string, EditorHandle>()

  get(columnId: string): BufferEntry | undefined {
    return this.#entries[columnId]
  }

  /** Opens `path` as a buffer column right of the focused column, or focuses
   *  the column it already has. Entering the buffer is the caller's move —
   *  opening shows the file, it does not take the keyboard. */
  async open(workspaceId: string, path: string): Promise<number | null> {
    if (catalog.source !== 'live') return null

    const columnId = fileColumnId(workspaceId, path)
    const already = this.#focus(workspaceId, columnId)
    if (already !== null) return already

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
        },
      }
      catalog.placeAfter(workspaceId, app.thread.id, {
        id: columnId,
        title: path,
        status: 'idle',
        meta: '',
        file: path,
      })
      return this.#focus(workspaceId, columnId)
    } catch (cause) {
      toasts.push({ tone: 'error', text: describe(cause) })
      return null
    }
  }

  /** The column's editor, while it is mounted. */
  register(columnId: string, handle: EditorHandle): () => void {
    this.#handles.set(columnId, handle)
    return () => this.#handles.delete(columnId)
  }

  /** Focus the editor: vim normal, or straight into insert. */
  enter(columnId: string, insert: boolean): void {
    const handle = this.#handles.get(columnId)
    if (!handle) return
    if (insert) handle.enterInsert()
    else handle.enterNormal()
  }

  /** Escape from vim NORMAL: the strip takes the keyboard back. */
  blur(columnId: string): void {
    this.#handles.get(columnId)?.blur()
  }

  /** What vim says the mode is, mirrored while this column is focused. */
  mirrorMode(columnId: string, vimMode: string): void {
    if (app.thread.id !== columnId) return
    if (app.mode !== 'NORMAL' && app.mode !== 'INSERT') return
    app.mode = vimMode === 'insert' ? 'INSERT' : 'NORMAL'
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

  /** Takes the column away and forgets the buffer. The strip owns focus
   *  reconciliation; the mode goes back to the strip with it. */
  close(columnId: string): void {
    const { [columnId]: _gone, ...rest } = this.#entries
    this.#entries = rest
    this.#handles.delete(columnId)
    catalog.closeColumn(columnId)
    if (app.mode === 'NORMAL' || app.mode === 'INSERT') app.mode = 'OCARINA'
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
