import type { UiEvent } from '../../../../../shared/protocol'
import type { AgentEntry } from '../../../../../shared/vocabulary'
import type { MockThread } from './types'

/** A fan-out, recorded as the events that would have produced it.
 *
 *  Three children under one spawn call, one of which spawns its own — the two
 *  levels the tree ever reaches. It exists so the row, the indent and the
 *  settled marks can be read in the browser harness without a model, and so a
 *  change to any of them is visible before it is live. */

const NOW = 1_760_000_000_000

function child(
  id: string,
  name: string,
  role: string,
  label: string,
  extra: Partial<AgentEntry> = {},
): AgentEntry {
  return {
    id,
    name,
    role,
    label,
    status: 'running',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    startedAt: NOW,
    ...extra,
  }
}

const ODYSSEUS = child('c-odysseus', 'odysseus', 'developer', 'implement the retry loop')
const CIRCE = child('c-circe', 'circe', 'scout', 'find every caller of runSync')
const ZEUS = child('c-zeus', 'zeus', 'reviewer', 'review the diff')

export const FAN_OUT: MockThread = {
  open: [],
  events: [
    {
      kind: 'user-message',
      id: 'u-fan',
      text: 'Split this across a few agents: find the callers, do the work, then review it.',
    },
    { kind: 'thread-state', state: 'running' },

    { kind: 'tool-start', id: 'spawn-1', tool: 'agent', target: 'spawn 3 agents' },

    { kind: 'tool-start', id: CIRCE.id, tool: 'agent', target: '', parentId: 'spawn-1', agent: CIRCE },
    { kind: 'tool-start', id: 'c-circe-grep', tool: 'grep', target: '"runSync" · src/**', parentId: CIRCE.id },
    { kind: 'tool-end', id: 'c-circe-grep', status: 'ok', meta: '7 matches' },
    {
      kind: 'agent-update',
      id: CIRCE.id,
      agent: {
        ...CIRCE,
        status: 'ok',
        endedAt: NOW + 34_000,
        output: 'Seven callers, all in src/sync.',
        usage: { input: 9_100, output: 240, cacheRead: 0, cacheWrite: 0, cost: 0.004 },
      },
    },

    {
      kind: 'tool-start',
      id: ODYSSEUS.id,
      tool: 'agent',
      target: '',
      parentId: 'spawn-1',
      agent: ODYSSEUS,
    },
    { kind: 'tool-start', id: 'c-ody-edit', tool: 'edit', target: 'src/sync/worker.ts', parentId: ODYSSEUS.id },
    { kind: 'tool-end', id: 'c-ody-edit', status: 'ok', meta: '+18 −4' },
    // The second level: a child that spawned its own to check the work.
    {
      kind: 'tool-start',
      id: 'c-hermes',
      tool: 'agent',
      target: '',
      parentId: ODYSSEUS.id,
      agent: child('c-hermes', 'hermes', 'scout', 'check the tests still name runSync'),
    },
    { kind: 'tool-start', id: 'c-hermes-read', tool: 'read', target: 'test/sync.test.ts', parentId: 'c-hermes' },

    { kind: 'tool-start', id: ZEUS.id, tool: 'agent', target: '', parentId: 'spawn-1', agent: ZEUS },
    {
      kind: 'agent-update',
      id: ZEUS.id,
      agent: { ...ZEUS, status: 'cancelled', endedAt: NOW + 12_000 },
    },
  ] satisfies UiEvent[],
}
