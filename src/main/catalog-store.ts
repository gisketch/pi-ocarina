import { randomUUID } from 'node:crypto'
import { nameFor, voiceFor } from '../shared/workspace-identity'
import {
  defaultCatalog,
  parsePreferences,
  readCatalog,
  writeCatalog,
  type CatalogState,
  type Preferences,
  type WorkspaceEntry,
} from './catalog'

/** Owns the catalog file.
 *
 *  Main is the only writer. The renderer sends its position and nothing else,
 *  so a layout save can never clobber the pinned workspaces that main added —
 *  which is exactly what happened when both sides wrote the whole document. */
export class CatalogStore {
  #state: CatalogState = defaultCatalog()
  #warning: string | undefined
  #writing: Promise<void> = Promise.resolve()

  readonly #file: string

  constructor(file: string) {
    this.#file = file
  }

  async load(): Promise<{ state: CatalogState; warning?: string }> {
    const { state, warning } = await readCatalog(this.#file)
    this.#state = state
    this.#warning = warning
    return { state: this.snapshot(), warning }
  }

  snapshot(): CatalogState {
    return {
      ...this.#state,
      workspaces: [...this.#state.workspaces],
      focus: [...this.#state.focus],
      approvals: structuredClone(this.#state.approvals),
      archived: structuredClone(this.#state.archived),
      order: structuredClone(this.#state.order),
    }
  }

  /** Hides a thread from its workspace's strip. The session file is untouched —
   *  closing a thread is not deleting its history. */
  archive(workspaceId: string, threadId: string): void {
    const existing = this.#state.archived[workspaceId] ?? []
    if (existing.includes(threadId)) return

    this.#state.archived[workspaceId] = [...existing, threadId]
    this.#persist()
  }

  /** Brings a closed thread back, which is what jumping to it from search does. */
  unarchive(workspaceId: string, threadId: string): void {
    const existing = this.#state.archived[workspaceId]
    if (!existing?.includes(threadId)) return

    const remaining = existing.filter((candidate) => candidate !== threadId)
    if (remaining.length > 0) this.#state.archived[workspaceId] = remaining
    else delete this.#state.archived[workspaceId]
    this.#persist()
  }

  listArchived(workspaceId: string): string[] {
    return [...(this.#state.archived[workspaceId] ?? [])]
  }

  hasApproval(workspaceId: string, key: string): boolean {
    return this.#state.approvals[workspaceId]?.includes(key) ?? false
  }

  addApproval(workspaceId: string, key: string): void {
    const existing = this.#state.approvals[workspaceId] ?? []
    if (existing.includes(key)) return

    this.#state.approvals[workspaceId] = [...existing, key]
    this.#persist()
  }

  removeApproval(workspaceId: string, key: string): void {
    const existing = this.#state.approvals[workspaceId]
    if (!existing?.includes(key)) return

    const remaining = existing.filter((candidate) => candidate !== key)
    if (remaining.length > 0) this.#state.approvals[workspaceId] = remaining
    else delete this.#state.approvals[workspaceId]
    this.#persist()
  }

  listApprovals(workspaceId: string): string[] {
    return [...(this.#state.approvals[workspaceId] ?? [])]
  }

  get warning(): string | undefined {
    return this.#warning
  }

  workspace(id: string): WorkspaceEntry | undefined {
    return this.#state.workspaces.find((entry) => entry.id === id)
  }

  /** Pins a folder, or returns the existing pin if it is already there. */
  pin(path: string): WorkspaceEntry {
    const existing = this.#state.workspaces.find((entry) => entry.path === path)
    if (existing) return existing

    const voice = voiceFor(path)
    const entry: WorkspaceEntry = {
      id: randomUUID(),
      path,
      name: nameFor(path),
      note: voice.note,
      hue: voice.hue,
    }

    this.#state.workspaces.push(entry)
    this.#persist()
    return entry
  }

  unpin(id: string): void {
    const index = this.#state.workspaces.findIndex((entry) => entry.id === id)
    if (index === -1) return

    const [removed] = this.#state.workspaces.splice(index, 1)
    this.#state.focus.splice(index, 1)
    // Unpinning revokes what was allowed there; re-pinning should ask again.
    delete this.#state.approvals[removed.id]
    // A folder that is no longer pinned has no strip to hide threads from.
    delete this.#state.archived[removed.id]
    delete this.#state.order[removed.id]
    this.#state.workspaceIndex = Math.min(
      this.#state.workspaceIndex,
      Math.max(0, this.#state.workspaces.length - 1),
    )
    this.#persist()
  }

  /** The renderer's remembered position. Deliberately the only thing it writes. */
  setPosition(
    workspaceIndex: number,
    focus: number[],
    preferences?: Preferences,
    order?: Record<string, string[]>,
  ): void {
    this.#state.workspaceIndex = workspaceIndex
    this.#state.focus = focus
    if (preferences) this.#state.preferences = parsePreferences(preferences)
    if (order) this.#state.order = order
    this.#persist()
  }

  orderOf(workspaceId: string): string[] {
    return [...(this.#state.order[workspaceId] ?? [])]
  }

  /** Writes are queued rather than raced, so the last call wins the file. */
  #persist(): void {
    const state = this.snapshot()
    this.#writing = this.#writing
      .then(() => writeCatalog(this.#file, state))
      .catch((error: unknown) => {
        // Losing layout is not worth interrupting a session over.
        console.warn('[catalog] save failed:', error)
      })
  }

  /** Lets shutdown wait for a write that is still in flight. */
  flush(): Promise<void> {
    return this.#writing
  }
}
