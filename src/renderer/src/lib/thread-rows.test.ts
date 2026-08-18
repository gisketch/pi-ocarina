import { describe, expect, it } from 'vitest'
import { hasSomething, withoutThinking } from './thread-rows'
import type { Block, ToolRow } from './thread'

const think = (id: string): ToolRow => ({ id, kind: 'think', target: 'a thought', status: 'ok' })
const read = (id: string): ToolRow => ({ id, kind: 'read', target: 'a.ts', status: 'ok' })

describe('taking the thinking out', () => {
  it('leaves a ledger that has other rows', () => {
    const block: Block = { kind: 'ledger', id: 'l1', rows: [think('t1'), read('r1')] }
    const kept = withoutThinking(block)

    expect(kept.kind === 'ledger' && kept.rows.map((row) => row.id)).toEqual(['r1'])
    expect(hasSomething(kept)).toBe(true)
  })

  it('empties a ledger that was nothing but thinking, and that one is dropped', () => {
    // An empty block still costs the column's gap, which is the space `o` was
    // asked to reclaim.
    const block: Block = { kind: 'ledger', id: 'l1', rows: [think('t1'), think('t2')] }
    const kept = withoutThinking(block)

    expect(kept.kind === 'ledger' && kept.rows).toEqual([])
    expect(hasSomething(kept)).toBe(false)
  })

  it('returns the same block when there was no thinking in it', () => {
    const block: Block = { kind: 'ledger', id: 'l1', rows: [read('r1')] }
    expect(withoutThinking(block)).toBe(block)
  })

  it('leaves every other kind of block alone', () => {
    const message: Block = { kind: 'user', id: 'u1', text: 'hello' }
    expect(withoutThinking(message)).toBe(message)
    expect(hasSomething(message)).toBe(true)
  })
})
