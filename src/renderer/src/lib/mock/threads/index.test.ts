import { describe, expect, it } from 'vitest'
import type { Block, ToolRow } from '../../thread'
import { replayThread } from '../../thread-reducer'
import { blocksFor, MOCK_THREADS } from './index'

/** The reference columns, projected. These assertions are the milestone-1
 *  fixtures restated: the hand-written blocks were replaced by recorded event
 *  streams, and the shell must still draw exactly the same columns. */

function kinds(blocks: Block[]): string[] {
  return blocks.map((block) => block.kind)
}

function rows(blocks: Block[]): ToolRow[] {
  return blocks.flatMap((block) => (block.kind === 'ledger' ? block.rows : []))
}

describe('every reference thread', () => {
  it.each(Object.keys(MOCK_THREADS))('%s projects to at least one block', (id) => {
    expect(blocksFor(id).length).toBeGreaterThan(0)
  })

  it('renders nothing for a thread that was never recorded', () => {
    expect(blocksFor('no-such-thread')).toEqual([])
  })

  it('gives every block a unique key', () => {
    for (const id of Object.keys(MOCK_THREADS)) {
      const ids = blocksFor(id).map((block) => block.id)
      expect(new Set(ids).size, id).toBe(ids.length)
    }
  })
})

describe('retry-backoff', () => {
  const blocks = blocksFor('retry-backoff')

  it('has the reference column order', () => {
    expect(kinds(blocks)).toEqual(['user', 'agent', 'ledger', 'agent', 'ask'])
  })

  it('lists all five tool rows with their outcomes', () => {
    expect(rows(blocks).map((row) => [row.kind, row.status, row.meta])).toEqual([
      ['read', 'plain', '142L'],
      ['grep', 'plain', '3 matches'],
      ['write', 'ok', '+38L new file'],
      ['edit', 'ok', '+14 −3'],
      ['bash', 'ok', 'exit 0 · 3.2s'],
    ])
  })

  it('carries one body of each expandable type', () => {
    const bodies = rows(blocks).map((row) => row.body?.type)
    expect(bodies).toEqual(['code', 'matches', undefined, 'diff', 'terminal'])
  })

  it('keeps the reference’s pre-expanded rows open', () => {
    const open = rows(blocks)
      .filter((row) => row.open)
      .map((row) => row.id)
    expect(open).toEqual(['r-grep', 'r-edit'])
  })

  it('waits on the unanswered question', () => {
    expect(replayThread(MOCK_THREADS['retry-backoff'].events).status).toBe('waiting-input')
  })
})

describe('flaky-e2e', () => {
  const blocks = blocksFor('flaky-e2e')

  it('has the reference column order', () => {
    expect(kinds(blocks)).toEqual(['user', 'ledger', 'agent'])
  })

  it('shows a failed run above one still in progress', () => {
    expect(rows(blocks).map((row) => [row.status, row.meta])).toEqual([
      ['fail', 'exit 1 · 41s'],
      ['running', 'run 4/10…'],
    ])
  })

  it('leaves the last message streaming, so the caret keeps blinking', () => {
    expect(blocks.at(-1)).toMatchObject({ kind: 'agent', streaming: true })
  })
})

describe('palette-flicker', () => {
  const blocks = blocksFor('palette-flicker')

  it('breaks the ledger where the approve card interrupts it', () => {
    expect(kinds(blocks)).toEqual(['user', 'ledger', 'approve', 'agent'])
  })

  it('shows the running search with its progress count', () => {
    expect(rows(blocks)[0]).toMatchObject({ status: 'running', meta: '214 files…' })
  })

  it('is waiting on the approval', () => {
    expect(replayThread(MOCK_THREADS['palette-flicker'].events).status).toBe('waiting-input')
  })
})

describe('icon-audit', () => {
  const blocks = blocksFor('icon-audit')

  it('has the reference column order', () => {
    expect(kinds(blocks)).toEqual(['user', 'ledger', 'agent'])
  })

  it('keeps the todo list expanded and complete', () => {
    const todo = rows(blocks).find((row) => row.kind === 'todo')
    expect(todo).toMatchObject({ open: true, status: 'ok', meta: '3/3 ✓' })
    expect(todo?.body).toMatchObject({ type: 'todo' })
  })
})

describe('queue-refactor', () => {
  it('opens on the agent’s summary, with the ledger below it', () => {
    expect(kinds(blocksFor('queue-refactor'))).toEqual(['agent', 'ledger'])
  })
})
