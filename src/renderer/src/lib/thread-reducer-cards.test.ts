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

describe('cards', () => {
  it('records what the user answered', () => {
    const model = run(
      {
        kind: 'ask',
        id: 'q1',
        questions: [
          {
            id: 'ship',
            kind: 'one',
            prompt: 'ship it?',
            choices: [
              { id: 'yes', title: 'yes' },
              { id: 'no', title: 'no' },
            ],
          },
        ],
      },
      {
        kind: 'ask-answered',
        id: 'q1',
        outcome: 'answered',
        answers: [{ id: 'ship', kind: 'one', chosen: ['no'], labels: ['no'] }],
      },
    )

    expect(model.blocks[0]).toMatchObject({
      outcome: 'answered',
      answers: [{ id: 'ship', chosen: ['no'] }],
    })
  })

  it('records a question the composer cancelled, and what was said instead', () => {
    const model = run(
      { kind: 'ask', id: 'q1', questions: [{ id: 'ship', kind: 'text', prompt: 'when?' }] },
      {
        kind: 'ask-answered',
        id: 'q1',
        outcome: 'cancelled',
        answers: [],
        said: 'none of those — do the other thing',
      },
    )

    expect(model.blocks[0]).toMatchObject({
      outcome: 'cancelled',
      said: 'none of those — do the other thing',
    })
  })

  it('records a question the turn ended under', () => {
    const model = run(
      { kind: 'ask', id: 'q1', questions: [{ id: 'ship', kind: 'text', prompt: 'when?' }] },
      { kind: 'ask-answered', id: 'q1', outcome: 'ended', answers: [], reason: 'turn cancelled' },
    )

    expect(model.blocks[0]).toMatchObject({ outcome: 'ended', reason: 'turn cancelled' })
    // Ended is not pending: nobody is waiting on the reader any more.
    expect(model.status).not.toBe('waiting-input')
  })

  it('records how an approval was resolved', () => {
    const model = run(
      { kind: 'approve', id: 'p1', command: 'rm -rf /' },
      { kind: 'approve-resolved', id: 'p1', outcome: 'deny' },
    )

    expect(model.blocks[0]).toMatchObject({ outcome: 'deny' })
  })

  it('shows an answer whose question is missing rather than losing the decision', () => {
    const model = run({ kind: 'ask-answered', id: 'ghost', outcome: 'answered', answers: [] })

    expect(model.blocks[0]).toMatchObject({ kind: 'raw', detail: 'ghost' })
  })

  it('shows an approval outcome whose card is missing', () => {
    const model = run({ kind: 'approve-resolved', id: 'ghost', outcome: 'always' })

    expect(model.blocks[0]).toMatchObject({ kind: 'raw', detail: 'ghost' })
  })

  it('does not let one card’s id resolve a different kind of card', () => {
    const model = run(
      { kind: 'approve', id: 'shared', command: 'pnpm i' },
      { kind: 'ask-answered', id: 'shared', outcome: 'answered', answers: [] },
    )

    expect(model.blocks[0]).toMatchObject({ kind: 'approve' })
    expect(model.blocks[0]).not.toHaveProperty('outcome')
    expect(model.blocks[1]).toMatchObject({ kind: 'raw' })
  })
})
