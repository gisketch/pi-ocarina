import { stat } from 'node:fs/promises'
import type { ThreadSummary, WorkspaceSummary } from '../../shared/protocol'
import type { CatalogStore } from '../catalog-store'

export type Sdk = typeof import('@earendil-works/pi-coding-agent')

/** Where a thread's transcript lives. */
export interface ThreadLocation {
  path: string
  cwd: string
}

/** Pinned folders and the threads inside them.
 *
 *  Threads are read from pi's own session store rather than tracked separately,
 *  so a session started by the `pi` CLI in a pinned folder simply appears, and
 *  the app can never disagree with pi about what exists. */
export class WorkspaceService {
  readonly #store: CatalogStore
  readonly #load: () => Promise<Sdk>

  /** Thread id → file, refreshed whenever threads are listed. */
  #located = new Map<string, ThreadLocation>()

  constructor(store: CatalogStore, load: () => Promise<Sdk>) {
    this.#store = store
    this.#load = load
  }

  list(): WorkspaceSummary[] {
    return this.#store.snapshot().workspaces
  }

  async pin(path: string): Promise<WorkspaceSummary> {
    const info = await stat(path).catch(() => null)
    if (!info?.isDirectory()) throw new Error(`not a folder: ${path}`)
    return this.#store.pin(path)
  }

  unpin(workspaceId: string): void {
    this.#store.unpin(workspaceId)
  }

  pathOf(workspaceId: string): string {
    const workspace = this.#store.workspace(workspaceId)
    if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`)
    return workspace.path
  }

  async listThreads(workspaceId: string): Promise<ThreadSummary[]> {
    const cwd = this.pathOf(workspaceId)
    const { SessionManager } = await this.#load()
    const sessions = await SessionManager.list(cwd)

    return sessions
      .map((session) => {
        this.#located.set(session.id, { path: session.path, cwd: session.cwd || cwd })
        return {
          id: session.id,
          title: session.name ?? firstLine(session.firstMessage) ?? 'untitled',
          modified: session.modified.toISOString(),
          messageCount: session.messageCount,
        }
      })
      .sort((a, b) => b.modified.localeCompare(a.modified))
  }

  /** Remembers a session created in this run, so it can be reopened without a
   *  disk scan. */
  remember(threadId: string, location: ThreadLocation): void {
    this.#located.set(threadId, location)
  }

  /** Finds a thread, scanning pinned workspaces only if it has not been seen. */
  async locate(threadId: string): Promise<ThreadLocation> {
    const known = this.#located.get(threadId)
    if (known) return known

    for (const workspace of this.list()) {
      await this.listThreads(workspace.id)
      const found = this.#located.get(threadId)
      if (found) return found
    }
    throw new Error(`unknown thread: ${threadId}`)
  }
}

function firstLine(text: string | undefined): string | undefined {
  const line = text?.split('\n').find((candidate) => candidate.trim().length > 0)
  return line ? line.trim().slice(0, 80) : undefined
}
