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
 *  `empty` is the real app before anything is pinned: the welcome screen, not
 *  a strip. `mock` is the design reference's demo state, and it belongs to the
 *  browser harness alone — the harness has no backend to pin against, so demo
 *  data is the only thing it can draw. The desktop app never shows it, because
 *  a person cannot tell a demo thread from a real one. The moment the backend
 *  reports a pinned folder, the real catalog replaces whichever it was — the
 *  three are never mixed. */
export type CatalogSource = 'empty' | 'mock' | 'live'

class Catalog {
  // In the desktop app the strip starts genuinely empty; only the harness,
  // which has no backend at all, starts on the demo state.
  workspaces = $state.raw<Workspace[]>(bridge ? [] : WORKSPACES)
  source = $state.raw<CatalogSource>(bridge ? 'empty' : 'mock')

  /** Reads the real catalog. Leaves the starting state alone when nothing is
   *  pinned: the welcome screen in the app, the demo in the harness. */
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
