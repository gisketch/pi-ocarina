// How one turn's agent output is grouped, and where the agent is named.
import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../../shared/protocol'
import { reduceBatch, reduceThread, replayThread } from './thread-reducer'
import { EMPTY_THREAD, type Block, type ToolBody, type ToolRow } from './thread'
import { marksTurnStart } from './thread-turn'

function run(...events: UiEvent[]) {
  return replayThread(events)
}

/** The block kinds, in order — the shape assertions read better than indexes. */
function kinds(blocks: Block[]): string[] {
  return blocks.map((block) => block.kind)
}

function rows(blocks: Block[]): ToolRow[] {
  return blocks.flatMap((block) => (block.kind === 'ledger' ? block.rows : []))
}

const start = (id: string): UiEvent => ({ kind: 'agent-message-start', id })
const delta = (id: string, text: string): UiEvent => ({ kind: 'agent-message-delta', id, text })
const tool = (id: string, parentId?: string): UiEvent => ({
  kind: 'tool-start',
  id,
  tool: 'read',
  target: `${id}.ts`,
  parentId,
})

describe('where the agent’s name is said', () => {
  const marks = (events: UiEvent[]) => marksTurnStart(replayThread(events).blocks)

  it('says it once above a whole turn of tool calls', () => {
    const model = replayThread([
      { kind: 'user-message', id: 'u1', text: 'run the checks' },
      ...[1, 2, 3].flatMap((n): UiEvent[] => [
        { kind: 'agent-message-start', id: `m${n}` },
        { kind: 'tool-start', id: `t${n}`, tool: 'bash', target: `check ${n}` },
      ]),
      { kind: 'agent-message-start', id: 'm4' },
      { kind: 'agent-message-delta', id: 'm4', text: 'all three passed' },
    ])

    // user, ledger, agent — and the name said once, above the ledger.
    expect(model.blocks.map((b) => b.kind)).toEqual(['user', 'ledger', 'agent'])
    expect(marksTurnStart(model.blocks)).toEqual([false, true, false])
  })

  it('says it again only when the user has spoken in between', () => {
    expect(
      marks([
        { kind: 'user-message', id: 'u1', text: 'one' },
        { kind: 'agent-message-start', id: 'm1' },
        { kind: 'agent-message-delta', id: 'm1', text: 'first' },
        { kind: 'user-message', id: 'u2', text: 'two' },
        { kind: 'agent-message-start', id: 'm2' },
        { kind: 'agent-message-delta', id: 'm2', text: 'second' },
      ]),
    ).toEqual([false, true, false, true])
  })

  it('does not let a checkpoint separator start a turn', () => {
    expect(
      marks([
        { kind: 'checkpoint', id: 'c1', label: 'one' },
        { kind: 'user-message', id: 'u1', text: 'one' },
        { kind: 'agent-message-start', id: 'm1' },
        { kind: 'agent-message-delta', id: 'm1', text: 'hi' },
      ]),
    ).toEqual([false, false, true])
  })

  it('names the agent above work that opens a thread with nothing said first', () => {
    expect(
      marks([{ kind: 'tool-start', id: 't1', tool: 'bash', target: 'boot' }]),
    ).toEqual([true])
  })
})
