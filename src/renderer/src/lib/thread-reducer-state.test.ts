import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../../shared/protocol'
import { reduceBatch, reduceThread, replayThread } from './thread-reducer'
import { collapsedBefore, EMPTY_THREAD, type Block, type ToolBody, type ToolRow } from './thread'

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

/** One question, one choice: enough to be a gate, short enough to inline. */
const ASK = {
  id: 'a',
  kind: 'one' as const,
  prompt: '?',
  choices: [{ id: 'a', title: 'a' }],
}

describe('thread status', () => {
  it('follows what the backend reports', () => {
    expect(run({ kind: 'thread-state', state: 'running' }).status).toBe('running')
  })

  it('says it is waiting while a question is unanswered', () => {
    const model = run(
      { kind: 'thread-state', state: 'running' },
      { kind: 'ask', id: 'q1', questions: [ASK] },
    )

    expect(model.status).toBe('waiting-input')
  })

  it('returns to the real state once the question is answered', () => {
    const model = run(
      { kind: 'thread-state', state: 'running' },
      { kind: 'ask', id: 'q1', questions: [ASK] },
      {
        kind: 'ask-answered',
        id: 'q1',
        outcome: 'answered',
        answers: [{ id: 'a', kind: 'one', chosen: ['a'], labels: ['a'] }],
      },
    )

    expect(model.status).toBe('running')
  })

  it('waits on a pending approval too', () => {
    const model = run(
      { kind: 'thread-state', state: 'running' },
      { kind: 'approve', id: 'p1', command: 'pnpm i' },
    )

    expect(model.status).toBe('waiting-input')
  })

  it('a failed thread stays failed even with a card still open', () => {
    const model = run(
      { kind: 'approve', id: 'p1', command: 'pnpm i' },
      { kind: 'thread-state', state: 'failed', reason: 'out of credit' },
    )

    expect(model.status).toBe('failed')
    expect(model.reason).toBe('out of credit')
  })

  it('a done thread with an unanswered ask still reads as waiting', () => {
    const model = run(
      { kind: 'ask', id: 'q1', questions: [ASK] },
      { kind: 'thread-state', state: 'done' },
    )

    expect(model.status).toBe('waiting-input')
    expect(model.runState).toBe('done')
  })
})

describe('checkpoints, compaction, steering', () => {
  it('places a checkpoint between blocks', () => {
    const model = run({ kind: 'user-message', id: 'u1', text: 'go' }, {
      kind: 'checkpoint',
      id: 'c1',
      label: 'go',
    })

    expect(kinds(model.blocks)).toEqual(['user', 'checkpoint'])
  })

  it('shows compaction running, then its summary', () => {
    const model = run({ kind: 'compaction-start', id: 'k1' }, {
      kind: 'compaction-done',
      id: 'k1',
      beforePercent: 82,
      afterPercent: 24,
      summary: 'kept the plan',
    })

    expect(model.blocks[0]).toMatchObject({ running: false, beforePercent: 82, afterPercent: 24 })
  })

  it('lands a compaction summary even when its start was never seen', () => {
    // Attaching mid-compaction must not leave a shimmer running forever, and
    // the compaction genuinely happened, so its result is shown.
    const model = run({
      kind: 'compaction-done',
      id: 'k1',
      beforePercent: 42,
      afterPercent: 18,
      summary: 'kept the plan',
    })

    expect(model.blocks[0]).toMatchObject({ kind: 'compaction', running: false, afterPercent: 18 })
  })

  it('never leaves two compaction blocks for one compaction', () => {
    const model = run({ kind: 'compaction-start', id: 'k1' }, {
      kind: 'compaction-done',
      id: 'k1',
      beforePercent: 42,
      afterPercent: 18,
      summary: 'kept the plan',
    })

    expect(model.blocks).toHaveLength(1)
  })

  it('stops the shimmer when pi refuses to compact', () => {
    const model = run({ kind: 'compaction-start', id: 'k1' }, {
      kind: 'compaction-skipped',
      id: 'k1',
      reason: 'Nothing to compact (session too small)',
    })

    expect(model.blocks).toHaveLength(1)
    expect(model.blocks[0]).toMatchObject({
      kind: 'compaction',
      running: false,
      skipped: 'Nothing to compact (session too small)',
    })
  })

  it('a refused compaction claims no summary', () => {
    const model = run({ kind: 'compaction-start', id: 'k1' }, {
      kind: 'compaction-skipped',
      id: 'k1',
      reason: 'aborted',
    })

    expect(model.blocks[0]).not.toHaveProperty('summary')
  })

  it('holds a queued steer until it is delivered', () => {
    const queued = run({ kind: 'steer-queued', id: 's1', text: 'also fix the test' })
    expect(queued.blocks[0]).toMatchObject({ kind: 'steer', text: 'also fix the test' })

    const delivered = reduceThread(queued, { kind: 'steer-delivered', id: 's1' })
    expect(delivered.blocks).toEqual([])
  })

  it('removes a steer the user cancelled', () => {
    const model = run({ kind: 'steer-queued', id: 's1', text: 'never mind' }, {
      kind: 'steer-cancelled',
      id: 's1',
    })

    expect(model.blocks).toEqual([])
  })
})

describe('side channels', () => {
  it('keeps the latest usage figures', () => {
    const model = run(
      { kind: 'usage', contextPercent: 10, tokens: 100, costUsd: 0.01 },
      { kind: 'usage', contextPercent: 38, tokens: 12_400, costUsd: 0.31 },
    )

    expect(model.usage).toEqual({ contextPercent: 38, tokens: 12_400, costUsd: 0.31 })
  })

  it('records a connectivity warning and its recovery', () => {
    const degraded = run({ kind: 'connectivity', state: 'degraded', retryInSeconds: 4 })
    expect(degraded.connectivity).toEqual({ state: 'degraded', retryInSeconds: 4 })

    const restored = reduceThread(degraded, { kind: 'connectivity', state: 'restored' })
    expect(restored.connectivity).toMatchObject({ state: 'restored' })
  })
})

describe('unknown events', () => {
  it('shows an event this build cannot name', () => {
    const model = run({ kind: 'raw', rawKind: 'sonata-experiment', detail: '{"note":"newer"}' })

    expect(model.blocks[0]).toMatchObject({ kind: 'raw', rawKind: 'sonata-experiment' })
  })

  it('gives every unknown event its own key', () => {
    const model = run(
      { kind: 'raw', rawKind: 'a' },
      { kind: 'raw', rawKind: 'b' },
      { kind: 'raw', rawKind: 'c' },
    )

    const ids = model.blocks.map((block) => block.id)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('reset and purity', () => {
  it('throws the thread away when history is about to be re-sent', () => {
    const model = run(
      { kind: 'user-message', id: 'u1', text: 'first life' },
      { kind: 'thread-state', state: 'done' },
      { kind: 'thread-reset' },
      { kind: 'user-message', id: 'u2', text: 'second life' },
    )

    expect(model.blocks).toEqual([{ kind: 'user', id: 'u2', text: 'second life' }])
    expect(model.status).toBe('idle')
  })

  it('never mutates the model it was given', () => {
    const before = run(tool('t1'))
    const snapshot = structuredClone(before)

    reduceThread(before, { kind: 'tool-end', id: 't1', status: 'ok' })

    expect(before).toEqual(snapshot)
  })

  it('a batch lands the same result as the events one at a time', () => {
    const events: UiEvent[] = [start('m1'), delta('m1', 'a'), tool('t1'), delta('m1', 'b')]

    expect(reduceBatch(EMPTY_THREAD, events)).toEqual(events.reduce(reduceThread, EMPTY_THREAD))
  })
})

describe('collapsing history behind a compaction', () => {
  const compaction = (running: boolean): Block => ({ kind: 'compaction', id: 'k1', running })
  const message = (id: string): Block => ({ kind: 'user', id, text: id })

  it('collapses nothing when no compaction has finished', () => {
    expect(collapsedBefore([message('a'), message('b')])).toBe(0)
    expect(collapsedBefore([message('a'), compaction(true)])).toBe(0)
  })

  it('collapses everything above a finished compaction', () => {
    expect(collapsedBefore([message('a'), message('b'), compaction(false)])).toBe(2)
  })

  it('collapses nothing when the compaction is the first block', () => {
    // There is no history above it to hide, so the card shows no control.
    expect(collapsedBefore([compaction(false), message('a')])).toBe(0)
  })

  it('uses the newest finished compaction when a thread has several', () => {
    const blocks: Block[] = [
      message('a'),
      { kind: 'compaction', id: 'k1', running: false },
      message('b'),
      message('c'),
      { kind: 'compaction', id: 'k2', running: false },
    ]

    expect(collapsedBefore(blocks)).toBe(4)
  })

  it('collapses nothing behind a compaction that was refused', () => {
    // Nothing was replaced, so there is no history it stands in front of.
    const blocks: Block[] = [
      message('a'),
      message('b'),
      { kind: 'compaction', id: 'k1', running: false, skipped: 'nothing to compact' },
    ]

    expect(collapsedBefore(blocks)).toBe(0)
  })

  it('keeps the last compaction collapsed while a newer one is still running', () => {
    const blocks: Block[] = [
      message('a'),
      { kind: 'compaction', id: 'k1', running: false },
      message('b'),
      { kind: 'compaction', id: 'k2', running: true },
    ]

    expect(collapsedBefore(blocks)).toBe(1)
  })
})
