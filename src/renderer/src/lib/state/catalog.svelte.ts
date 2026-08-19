import type { ThreadId } from '../../../../shared/thread-id'
import type { ThreadSummary, WorkspaceSummary } from '../../../../shared/protocol'
import { describe, freshThread, toThread, withTerminal } from './catalog-build'
import { bridge } from '../bridge'
import { blocksFor, MOCK_THREADS } from '../mock/threads'
import { WORKSPACES } from '../mock/workspaces'
import { session } from '../session'
import { replayThread } from '../thread-reducer'
import type { Thread, Workspace } from '../types'
import { app, PLACEHOLDER_TITLE } from './app.svelte'
import { threads } from './threads.svelte'
import { toasts } from './toasts.svelte'

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

    // Shells and arrangement are the renderer's alone — the backend listing
    // knows only about threads. Reloading (pinning a second folder, say) would
    // otherwise drop an open terminal column and undo every ⇧H/⇧L.
    const shells = new Set(
      this.workspaces
        .filter((workspace) => workspace.threads.some((thread) => thread.terminal))
        .map((workspace) => workspace.id),
    )
    const arrangement = Object.fromEntries(
      this.workspaces.map((workspace) => [workspace.id, workspace.threads.map((t) => t.id)]),
    )

    const built = await Promise.all(pinned.map((workspace) => this.#build(workspace)))
    this.workspaces = built.map((workspace) =>
      shells.has(workspace.id) ? withTerminal(workspace) : workspace,
    )
    this.source = 'live'
    this.applyOrder(arrangement)
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
   *  there is no live workspace to start it in.
   *
   *  The new column is built from the id the backend just returned rather than
   *  by re-listing the workspace. pi may not have written the session file yet,
   *  so a listing taken now can come back without the thread in it — and the
   *  column would vanish underneath a turn that is already running. */
  async newThread(workspaceId: string, worktree?: { branch: string }): Promise<ThreadId | null> {
    if (this.source !== 'live') return null
    this.error = null

    try {
      const { threadId } = await session.invoke('createThread', { workspaceId, worktree })
      threads.follow(threadId)
      this.#insert(workspaceId, threadId, PLACEHOLDER_TITLE, worktree?.branch ?? null)
      return threadId
    } catch (cause) {
      this.error = describe(cause)
      // A refused worktree is reported by the question, which is still up and
      // holds the field that would fix it. Everything else has no surface of
      // its own, so it gets a toast rather than a silence.
      if (!worktree) toasts.push({ tone: 'error', text: describe(cause) })
      return null
    }
  }

  /** Renames one thread's column, wherever it is. Driven by the `titled`
   *  event and by the rename dialog's optimistic write — the session file
   *  already holds the name, this only keeps the header from waiting for a
   *  relaunch to show it. */
  retitle(threadId: string, title: string): void {
    this.workspaces = this.workspaces.map((workspace) =>
      workspace.threads.some((thread) => thread.id === threadId)
        ? {
            ...workspace,
            threads: workspace.threads.map((thread) =>
              thread.id === threadId ? { ...thread, title } : thread,
            ),
          }
        : workspace,
    )
  }

  /** Puts the workspace's shell on the strip. One per workspace: asking twice
   *  is asking for the one that is already there. */
  openTerminal(workspaceId: string): void {
    this.workspaces = this.workspaces.map((workspace) =>
      workspace.id === workspaceId ? withTerminal(workspace) : workspace,
    )
    app.reconcile()
  }

  /** Reports a column that could not start, and takes it away again. */
  failColumn(columnId: string, cause: unknown): void {
    this.error = describe(cause)
    this.closeColumn(columnId)
  }

  /** Takes any column off the strip without telling the backend anything — the
   *  caller has already done whatever that column needed. */
  closeColumn(columnId: string): void {
    this.workspaces = this.workspaces.map((workspace) => {
      if (!workspace.threads.some((thread) => thread.id === columnId)) return workspace

      const remaining = workspace.threads.filter((thread) => thread.id !== columnId)
      return {
        ...workspace,
        threads: remaining.length > 0 ? remaining : [freshThread(workspace)],
      }
    })
    app.reconcile()
  }

  /** Moves a column within its workspace. The strip is the user's to arrange,
   *  so this is a plain reorder — nothing about the thread or shell changes. */
  moveColumn(workspaceId: string, from: number, to: number): void {
    this.workspaces = this.workspaces.map((workspace) => {
      if (workspace.id !== workspaceId) return workspace

      const threads = workspace.threads.slice()
      if (from < 0 || to < 0 || from >= threads.length || to >= threads.length) return workspace

      const [moved] = threads.splice(from, 1)
      threads.splice(to, 0, moved)
      return { ...workspace, threads }
    })
  }

  /** Restores the order the user last arranged.
   *
   *  Columns the stored order does not mention keep their listing position at
   *  the end — a thread created since the last save must appear, not vanish
   *  because an older order never heard of it. */
  applyOrder(order: Record<string, string[]>): void {
    this.workspaces = this.workspaces.map((workspace) => {
      const wanted = order[workspace.id]
      if (!wanted?.length) return workspace

      const known = wanted
        .map((id) => workspace.threads.find((thread) => thread.id === id))
        .filter((thread): thread is Thread => thread !== undefined)
      const rest = workspace.threads.filter((thread) => !wanted.includes(thread.id))
      return { ...workspace, threads: [...known, ...rest] }
    })
    app.reconcile()
  }

  /** Puts a dashboard column on the workspace's strip and returns its index.
   *
   *  Creates nothing in the backend: the dashboard is where a thread is
   *  chosen, not a thread. One per workspace — the column's id is minted from
   *  the workspace's, so a second `␣n` finds the first dashboard and focuses
   *  it rather than lining up a row of launchers. */
  addDashboard(workspaceId: string): number {
    const workspace = this.workspaces.find((candidate) => candidate.id === workspaceId)
    if (!workspace) return -1

    const present = workspace.threads.findIndex((thread) => thread.fresh)
    if (present !== -1) return present

    this.workspaces = this.workspaces.map((candidate) =>
      candidate.id === workspaceId
        ? { ...candidate, threads: [...candidate.threads, freshThread(candidate)] }
        : candidate,
    )
    app.reconcile()
    return this.workspaces.find((candidate) => candidate.id === workspaceId)!.threads.length - 1
  }

  /** Takes a thread off the strip. Its session file is untouched: closing hides
   *  a column, so history search still finds the thread and `reopen` brings it
   *  back. A workspace left with no threads gets its fresh column again, rather
   *  than becoming a workspace you cannot type into. */
  closeThread(threadId: ThreadId): void {
    this.error = null
    this.workspaces = this.workspaces.map((workspace) => {
      if (!workspace.threads.some((thread) => thread.id === threadId)) return workspace

      const remaining = workspace.threads.filter((thread) => thread.id !== threadId)
      return {
        ...workspace,
        threads: remaining.length > 0 ? remaining : [freshThread(workspace)],
      }
    })
    app.reconcile()

    void session.invoke('archiveThread', { threadId }).catch((cause: unknown) => {
      // The column is already gone, which is what was asked for. This only
      // means it will be back after a relaunch.
      this.error = describe(cause)
    })
  }

  /** Brings a closed thread back onto its workspace's strip, and returns its
   *  column. Used when a search hit lands on a thread the user had closed. */
  async reopen(
    workspaceId: string,
    threadId: ThreadId,
    title: string,
    branch: string | null = null,
  ): Promise<number> {
    this.error = null

    try {
      await session.invoke('unarchiveThread', { threadId })
    } catch (cause) {
      // It can still be shown now; it just will not persist as reopened.
      this.error = describe(cause)
    }

    threads.follow(threadId)
    this.#insert(workspaceId, threadId, title, branch)
    return this.workspaces
      .find((workspace) => workspace.id === workspaceId)
      ?.threads.findIndex((thread) => thread.id === threadId) ?? -1
  }

  /** Puts a just-created thread on its workspace's strip. A dashboard column
   *  is replaced *at its own position* — the launcher becomes the thread it
   *  launched, and the strip gains exactly one column where the reader was
   *  already looking. Without a dashboard the thread goes on the end. */
  #insert(
    workspaceId: string,
    threadId: ThreadId,
    title = PLACEHOLDER_TITLE,
    branch: string | null = null,
  ): void {
    // The branch comes with the creation. Nothing re-lists the workspace
    // afterwards, so a column built without it would be a column that does
    // not know it is isolated until the app restarts — and everything that
    // reads `branch` would be wrong in the meantime, the sweep's "a thread
    // is open here" included.
    const made = { id: threadId, title, status: 'idle' as const, meta: '', branch }

    this.workspaces = this.workspaces.map((workspace) => {
      if (workspace.id !== workspaceId) return workspace

      const kept = workspace.threads.filter((thread) => thread.id !== threadId)
      const dashboard = kept.findIndex((thread) => thread.fresh)
      const threads =
        dashboard === -1
          ? [...kept, made]
          : kept.map((thread, i) => (i === dashboard ? made : thread))
      return { ...workspace, threads }
    })
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

    for (const summary of listed) threads.follow(summary.id)

    return {
      id: workspace.id,
      name: workspace.name,
      note: workspace.note,
      hue: workspace.hue,
      // Filled in by the git pipeline once it has read the folder. Null until
      // then, so the chrome shows no branch rather than one nobody confirmed.
      git: null,
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

export const catalog = new Catalog()

/** Hands the mock catalog's recorded streams to the thread store, so demo and
 *  live columns render through exactly one path. */
export function seedMockThreads(): void {
  for (const id of Object.keys(MOCK_THREADS)) {
    threads.seed(id, { ...replayThread(MOCK_THREADS[id].events), blocks: blocksFor(id) })
  }
}
