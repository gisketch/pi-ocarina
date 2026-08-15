import type { ThreadSummary, WorkspaceSummary } from '../../../../shared/protocol'
import { bridge } from '../bridge'
import { blocksFor, MOCK_THREADS } from '../mock/threads'
import { WORKSPACES } from '../mock/workspaces'
import { session } from '../session'
import { replayThread } from '../thread-reducer'
import type { Thread, Workspace } from '../types'
import { app } from './app.svelte'
import { threads } from './threads.svelte'

/** Where the strip's workspaces come from.
 *
 *  `mock` is the design reference's demo state, kept so the shell can be
 *  reviewed against the reference and so the browser harness has something to
 *  draw. The moment the backend reports a pinned folder, the real catalog
 *  replaces it wholesale — the two are never mixed, because a column that is
 *  half demo and half real cannot be trusted. */
export type CatalogSource = 'mock' | 'live'

class Catalog {
  workspaces = $state.raw<Workspace[]>(WORKSPACES)
  source = $state.raw<CatalogSource>('mock')

  /** Reads the real catalog. Falls back to the demo state when there is no
   *  backend or nothing is pinned yet, so the window is never blank. */
  async load(): Promise<void> {
    const pinned = await this.#listWorkspaces()
    if (pinned.length === 0) return

    const built = await Promise.all(pinned.map((workspace) => this.#build(workspace)))
    this.workspaces = built
    this.source = 'live'
    // The demo catalog just went away underneath whatever was focused.
    app.reconcile()
  }

  /** Why the last pin or thread creation failed. Cleared when the next one
   *  starts, so a stale message never sits under a successful action. */
  error = $state.raw<string | null>(null)

  /** Pins a folder the user picked, then reloads. Returns false when they
   *  cancelled, when there is no native picker to ask, or when the backend
   *  refused the folder — the caller keeps the overlay open and `error` says
   *  why, rather than the click doing nothing at all. */
  async pin(): Promise<boolean> {
    this.error = null

    const path = await bridge?.dialog.pickDirectory()
    if (!path) return false

    try {
      await session.invoke('pinWorkspace', { path })
      await this.load()
      return true
    } catch (cause) {
      this.error = describe(cause)
      return false
    }
  }

  /** Starts a real thread in a pinned workspace. Returns its id, or null when
   *  the catalog is still the demo state and there is nothing to start it in. */
  async newThread(workspaceId: string): Promise<string | null> {
    if (this.source !== 'live') return null
    this.error = null

    try {
      const { threadId } = await session.invoke('createThread', { workspaceId })
      threads.follow(threadId)
      await this.load()
      return threadId
    } catch (cause) {
      this.error = describe(cause)
      return null
    }
  }

  async #listWorkspaces(): Promise<WorkspaceSummary[]> {
    try {
      const { workspaces } = await session.invoke('listWorkspaces', {})
      return workspaces
    } catch {
      // No backend (browser harness) or the catalog could not be read; the demo
      // state stands in rather than the app failing to start.
      return []
    }
  }

  async #build(workspace: WorkspaceSummary): Promise<Workspace> {
    const listed = await this.#listThreads(workspace.id)
    const built = listed.map(toThread)

    for (const thread of built) threads.follow(thread.id)

    return {
      id: workspace.id,
      name: workspace.name,
      note: workspace.note,
      hue: workspace.hue,
      // Git detail belongs to the git & terminal milestone; until then the
      // chrome shows the workspace without inventing a branch for it.
      branch: '',
      git: '',
      snippet: workspace.path,
      threads: built.length > 0 ? built : [freshThread(workspace)],
    }
  }

  async #listThreads(workspaceId: string): Promise<ThreadSummary[]> {
    try {
      const { threads: listed } = await session.invoke('listThreads', { workspaceId })
      return listed
    } catch {
      return []
    }
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function toThread(summary: ThreadSummary): Thread {
  return {
    id: summary.id,
    title: summary.title,
    // The real status arrives with the thread's first events; until then the
    // column reads as idle rather than claiming to know.
    status: 'idle',
    meta: timeOf(summary.modified),
  }
}

function freshThread(workspace: WorkspaceSummary): Thread {
  return {
    id: `fresh:${workspace.id}`,
    title: workspace.name,
    status: 'idle',
    meta: 'fresh thread',
    fresh: true,
  }
}

/** "14:02" from an ISO timestamp; the column header has room for little else. */
function timeOf(modified: string): string {
  const at = new Date(modified)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const catalog = new Catalog()

/** Hands the mock catalog's recorded streams to the thread store, so demo and
 *  live columns render through exactly one path. */
export function seedMockThreads(): void {
  for (const id of Object.keys(MOCK_THREADS)) {
    threads.seed(id, { ...replayThread(MOCK_THREADS[id].events), blocks: blocksFor(id) })
  }
}
