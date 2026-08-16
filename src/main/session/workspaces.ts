import { listWorkspaceFiles } from './files'
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

  /** Paths the @-mention picker offers, relative to the workspace root. */
  async listFiles(workspaceId: string): Promise<string[]> {
    return listWorkspaceFiles(this.pathOf(workspaceId))
  }

  /** Which pinned workspace owns a folder. Falls back to the path itself so an
   *  approval rule is still scoped to something stable rather than to nothing. */
  idForPath(path: string): string {
    return this.list().find((workspace) => workspace.path === path)?.id ?? path
  }

  /** The workspace's threads, newest first.
   *
   *  Threads the user closed are left out, because the strip is what "closed"
   *  means. `includeArchived` is for history search, which must still find them
   *  — closing a thread hides its column, it does not delete its history. */
  async listThreads(
    workspaceId: string,
    { includeArchived = false }: { includeArchived?: boolean } = {},
  ): Promise<ThreadSummary[]> {
    const cwd = this.pathOf(workspaceId)
    const { SessionManager } = await this.#load()
    const sessions = await SessionManager.list(cwd)
    // Every session is located, closed ones included: `locate` is how search
    // reads a transcript and how a closed thread is reopened, and a thread we
    // cannot find is a thread that cannot come back.
    for (const session of sessions) {
      this.#located.set(session.id, { path: session.path, cwd: session.cwd || cwd })
    }

    const hidden = includeArchived ? [] : this.#store.listArchived(workspaceId)

    return sessions
      .filter((session) => !hidden.includes(session.id))
      .map((session) => ({
        id: session.id,
        title: session.name ?? firstLine(session.firstMessage) ?? 'untitled',
        modified: session.modified.toISOString(),
        messageCount: session.messageCount,
      }))
      .sort((a, b) => b.modified.localeCompare(a.modified))
  }

  /** Records, or forgets, that a thread is hidden from its workspace's strip.
   *
   *  The workspace comes from where the session file lives, since a thread only
   *  ever knows its own folder. A thread whose folder is no longer pinned has no
   *  strip to be hidden from, so there is nothing to record. */
  async setArchived(threadId: string, archived: boolean): Promise<void> {
    const location = await this.locate(threadId).catch(() => null)
    if (!location) return

    const workspaceId = this.idForPath(location.cwd)
    if (archived) this.#store.archive(workspaceId, threadId)
    else this.#store.unarchive(workspaceId, threadId)
  }

  /** Remembers a session created in this run, so it can be reopened without a
   *  disk scan. */
  remember(threadId: string, location: ThreadLocation): void {
    this.#located.set(threadId, location)
  }

  /** The working directory of a thread already seen, without the scan `locate`
   *  would do. A caller that only wants to shorten a path should not pay for a
   *  workspace walk to do it. */
  cwdOf(threadId: string): string | undefined {
    return this.#located.get(threadId)?.cwd
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
