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

  return {
    ...workspace,
    threads: [
      ...workspace.threads.filter((thread) => !thread.fresh),
      { id, title: 'zsh', status: 'idle', meta: '', terminal: true },
    ],
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

/** "14:02" from an ISO timestamp; the column header has room for little else. */
function timeOf(modified: string): string {
  const at = new Date(modified)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
