/** Building the strip's columns from what the backend lists.
 *
 *  Split from the catalog on size alone: these are pure builders — summary in,
 *  column out — and the catalog is the state that calls them. */

import type { ThreadSummary } from '../../../../shared/protocol'
import { terminalId, type Thread, type Workspace } from '../types'

export function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function toThread(summary: ThreadSummary): Thread {
  return {
    id: summary.id,
    title: summary.title,
    // The real status arrives with the thread's first events; until then the
    // column reads as idle rather than claiming to know.
    status: 'idle',
    meta: timeOf(summary.modified),
    branch: summary.branch ?? null,
  }
}

/** The workspace with its shell column present. Idempotent: asking twice is
 *  asking for the one that is already there. */
export function withTerminal(workspace: Workspace): Workspace {
  const id = terminalId(workspace.id)
  if (workspace.threads.some((thread) => thread.id === id)) return workspace

  // The dashboard stays. It used to be filtered out here, when `fresh` only
  // meant "this workspace has nothing yet" — but a dashboard is a column the
  // reader asked for, and opening a terminal is not an answer to it.
  return {
    ...workspace,
    threads: [...workspace.threads, { id, title: 'zsh', status: 'idle', meta: '', terminal: true }],
  }
}

export function freshThread(workspace: { id: string; name: string }): Thread {
  return {
    id: `fresh:${workspace.id}`,
    title: workspace.name,
    status: 'idle',
    meta: 'fresh thread',
    fresh: true,
  }
}

/** The workspaces with `made` placed directly right of `afterId`'s column.
 *
 *  A parent that is no longer on the strip means the anchor is gone, not the
 *  intent — the column goes on the end. A `made.id` already present is moved,
 *  not duplicated: the strip never shows one thread twice. */
export function withThreadAfter(
  workspaces: readonly Workspace[],
  workspaceId: string,
  afterId: string,
  made: Thread,
): Workspace[] {
  return workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) return workspace

    const kept = workspace.threads.filter((thread) => thread.id !== made.id)
    const anchor = kept.findIndex((thread) => thread.id === afterId)
    const threads =
      anchor === -1 ? [...kept, made] : [...kept.slice(0, anchor + 1), made, ...kept.slice(anchor + 1)]
    return { ...workspace, threads }
  })
}

/** "14:02" from an ISO timestamp; the column header has room for little else. */
function timeOf(modified: string): string {
  const at = new Date(modified)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
