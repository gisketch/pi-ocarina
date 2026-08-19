/** The dashboard's recent threads: the five newest a workspace has closed.
 *
 *  Scoped to one workspace and capped, on purpose. The strip already shows
 *  what is open, so an open thread is never listed here — a launcher that
 *  offered a duplicate column would be a trap — and everything older than
 *  five is the search's job, not a longer menu.
 *
 *  Opening reuses `catalog.reopen`, whose insert replaces the dashboard
 *  column at its own strip position: the launcher becomes the thread the
 *  reader picked, where they were already looking. */

import type { ThreadSummary } from '../../../../shared/protocol'
import { session } from '../session'
import { app } from './app.svelte'
import { catalog } from './catalog.svelte'

export const RECENT_ROWS = 5

class DashboardRecent {
  /** Everything the backend listed, by workspace. Unfiltered: what is open
   *  changes without a re-list, so the filter runs at read time. */
  #listed = $state.raw<Record<string, ThreadSummary[]>>({})
  /** The selection bar, by workspace — a workspace has one dashboard. */
  #selected = $state.raw<Record<string, number>>({})

  /** Reads the workspace's history. Called when a dashboard comes up; a
   *  failure leaves the list empty, which draws as a workspace with none. */
  async load(workspaceId: string): Promise<void> {
    if (catalog.source !== 'live') return
    try {
      // Archived included, because archived is the point: `␣x` is what put a
      // thread into this list. Without the flag the backend returns only the
      // open threads — which the filter below then removes as open, so the
      // launcher's history was empty forever, whatever the reader closed.
      const { threads } = await session.invoke('listThreads', { workspaceId, includeArchived: true })
      this.#listed = { ...this.#listed, [workspaceId]: threads }
    } catch {
      this.#listed = { ...this.#listed, [workspaceId]: [] }
    }
  }

  /** Every closed thread, newest first. The picker's list. */
  all(workspaceId: string): ThreadSummary[] {
    const listed = this.#listed[workspaceId] ?? []
    const open = new Set(
      catalog.workspaces
        .find((workspace) => workspace.id === workspaceId)
        ?.threads.map((thread) => thread.id) ?? [],
    )
    return listed
      .filter((summary) => !open.has(summary.id))
      .sort((a, b) => b.modified.localeCompare(a.modified))
  }

  /** The five newest closed threads, newest first. */
  rows(workspaceId: string): ThreadSummary[] {
    return this.all(workspaceId).slice(0, RECENT_ROWS)
  }

  /** Opens one listed thread in the dashboard's place. The picker's pick. */
  async openThread(workspaceId: string, summary: ThreadSummary): Promise<void> {
    const column = await catalog.reopen(workspaceId, summary.id, summary.title, summary.branch ?? null)
    if (column === -1 || app.workspace.id !== workspaceId) return
    app.focusThread(column)
  }

  selected(workspaceId: string): number {
    return this.#selected[workspaceId] ?? 0
  }

  move(workspaceId: string, delta: number): void {
    const count = this.rows(workspaceId).length
    if (count === 0) return
    const next = Math.max(0, Math.min(count - 1, this.selected(workspaceId) + delta))
    this.#selected = { ...this.#selected, [workspaceId]: next }
  }

  /** A dashboard that just came up starts at the top. Selection is not a
   *  memory worth keeping across launchers — the list underneath has moved. */
  resetBar(workspaceId: string): void {
    this.#selected = { ...this.#selected, [workspaceId]: 0 }
  }

  /** Lands the selection on one row by its thread id. The leap's way in. */
  select(workspaceId: string, threadId: string): void {
    const index = this.rows(workspaceId).findIndex((summary) => summary.id === threadId)
    if (index === -1) return
    this.#selected = { ...this.#selected, [workspaceId]: index }
  }

  /** Opens the selected thread. The dashboard column becomes it. */
  async open(workspaceId: string): Promise<void> {
    const row = this.rows(workspaceId)[this.selected(workspaceId)]
    if (!row) return
    await this.openThread(workspaceId, row)
  }
}

export const dashboardRecent = new DashboardRecent()

/** "2h" for the row's right edge — the shortest read of how stale it is. */
export function ago(iso: string, now = Date.now()): string {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return ''
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
