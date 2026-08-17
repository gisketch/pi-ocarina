/** A `spawn_agents` call, read back out of a session file.
 *
 *  Children are not in pi's transcript. They were sessions of their own with no
 *  files, and their rows were events this app emitted — so a reopened thread
 *  would show one tool row saying `spawn_agents ✓` about a fan-out the reader
 *  watched happen, and the names, the roles and the bill would be gone.
 *
 *  The entries are in the recorded result's `details`, which pi stores and never
 *  sends to a model, so keeping them there costs disk and not tokens. What comes
 *  back is the rows, not the steps: a child's own calls are not persisted, and a
 *  peek on a replayed row shows its report instead. */

import type { UiEvent } from '../../shared/protocol'
import type { AgentEntry } from '../../shared/vocabulary'

export const SPAWN_TOOL = 'spawn_agents'

/** The entries a recorded result carries, or null when it has none this build
 *  can read — a transcript from an older version, or a call that never ran. */
export function agentsFromResult(result: unknown): AgentEntry[] | null {
  const details = (result as { details?: unknown })?.details
  const agents = (details as { agents?: unknown })?.agents
  if (!Array.isArray(agents)) return null

  const entries = agents.filter(readable)
  return entries.length > 0 ? entries : null
}

/** The rows for one recorded fan-out, nested under the call that made them. */
export function rowsFromResult(toolCallId: string, entries: readonly AgentEntry[]): UiEvent[] {
  const events: UiEvent[] = []

  for (const entry of entries) {
    events.push({
      kind: 'tool-start',
      id: entry.id,
      tool: 'agent',
      target: entry.label,
      parentId: toolCallId,
      agent: entry,
    })
    // Replayed rows are always settled: the turn they belonged to is over, and
    // a child that was still running when the app closed did not survive it.
    events.push({
      kind: 'tool-end',
      id: entry.id,
      status: entry.status === 'running' ? 'cancelled' : entry.status,
    })
  }
  return events
}

/** Whether an entry has the fields a row is drawn from. A partial one is
 *  dropped rather than patched: a row with no name is worse than no row. */
function readable(value: unknown): value is AgentEntry {
  const entry = value as Partial<AgentEntry> | null
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.role === 'string' &&
    typeof entry.label === 'string'
  )
}
