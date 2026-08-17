import { describe, expect, it } from 'vitest'
import { replayThread } from '../../renderer/src/lib/thread-reducer'
import type { AgentEntry } from '../../shared/vocabulary'
import { emitReplay } from './replay'
import { agentsFromResult, rowsFromResult } from './spawn-replay'

const entry = (extra: Partial<AgentEntry> = {}): AgentEntry => ({
  id: 'c1',
  name: 'circe',
  role: 'scout',
  label: 'find callers',
  status: 'ok',
  output: 'seven callers',
  usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, cost: 0.004 },
  startedAt: 1_000,
  endedAt: 35_000,
  ...extra,
})

describe('reading a fan-out back out of a result', () => {
  it('takes the entries the tool recorded', () => {
    const found = agentsFromResult({ details: { agents: [entry()] } })
    expect(found?.[0].name).toBe('circe')
  })

  it('reports nothing for a result this build cannot read', () => {
    expect(agentsFromResult({ details: {} })).toBeNull()
    expect(agentsFromResult({})).toBeNull()
    expect(agentsFromResult(null)).toBeNull()
    expect(agentsFromResult({ details: { agents: 'three' } })).toBeNull()
  })

  it('drops an entry with no name rather than drawing a nameless row', () => {
    const found = agentsFromResult({
      details: { agents: [{ id: 'c1', role: 'scout', label: 'x' }, entry()] },
    })
    expect(found).toHaveLength(1)
  })
})

describe('the rows a replayed fan-out becomes', () => {
  it('nests every child under the call that started it', () => {
    const events = rowsFromResult('spawn-1', [entry(), entry({ id: 'c2', name: 'zeus' })])
    const starts = events.filter((event) => event.kind === 'tool-start')

    expect(starts).toHaveLength(2)
    expect(starts.every((event) => event.kind === 'tool-start' && event.parentId === 'spawn-1')).toBe(
      true,
    )
  })

  it('settles a child that was still running when the app closed', () => {
    // It did not survive the app, and a row left running would pulse forever.
    const events = rowsFromResult('spawn-1', [entry({ status: 'running', endedAt: undefined })])
    expect(events.at(-1)).toMatchObject({ kind: 'tool-end', status: 'cancelled' })
  })

  it('carries the name, the role and the bill back with it', () => {
    const [start] = rowsFromResult('spawn-1', [entry()])
    expect(start).toMatchObject({
      kind: 'tool-start',
      agent: { name: 'circe', role: 'scout', usage: { cost: 0.004 } },
    })
  })
})

describe('a whole reopened thread', () => {
  function replayed(result: unknown) {
    const events: Parameters<typeof replayThread>[0] = []
    emitReplay((event) => (events as unknown[]).push(event), [
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'spawn-1', name: 'spawn_agents', arguments: { agents: [{}] } },
          ],
        },
      },
      {
        type: 'message',
        message: { role: 'toolResult', toolCallId: 'spawn-1', toolName: 'spawn_agents', ...(result as object) },
      },
    ] as never)
    return replayThread(events)
  }

  it('redraws every child row under the spawn call', () => {
    const model = replayed({ details: { agents: [entry(), entry({ id: 'c2', name: 'zeus' })] } })
    const rows = model.blocks.flatMap((block) => (block.kind === 'ledger' ? block.rows : []))

    expect(rows).toHaveLength(1)
    expect(rows[0].children?.map((child) => child.agent?.name)).toEqual(['circe', 'zeus'])
    expect(rows[0].children?.[0].agent?.label).toBe('find callers')
  })

  it('leaves a call it cannot read as an ordinary tool row', () => {
    // A transcript from a build before this existed, or a call that never ran.
    const model = replayed({ details: {} })
    const rows = model.blocks.flatMap((block) => (block.kind === 'ledger' ? block.rows : []))

    expect(rows).toHaveLength(1)
    expect(rows[0].children).toBeUndefined()
    expect(rows[0].status).toBe('ok')
  })
})
