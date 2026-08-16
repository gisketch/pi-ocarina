import { describe, expect, it } from 'vitest'
import { navBlocks, step } from './blocks'
import type { Block } from './thread'

const user = (id: string, text = 'hello'): Block => ({ kind: 'user', id, text })
const agent = (id: string, text = 'sure'): Block => ({ kind: 'agent', id, text })

describe('navBlocks', () => {
  it('gives every ledger row its own entry', () => {
    const blocks: Block[] = [
      {
        kind: 'ledger',
        id: 'l1',
        rows: [
          { id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' },
          { id: 'r2', kind: 'edit', target: 'b.ts', status: 'ok' },
          { id: 'r3', kind: 'bash', target: 'pnpm test', status: 'ok' },
        ],
      },
    ]

    expect(navBlocks(blocks).map((entry) => entry.id)).toEqual(['l1:r1', 'l1:r2', 'l1:r3'])
    expect(navBlocks(blocks)[0]).toMatchObject({ kind: 'tool', blockId: 'l1', rowId: 'r1' })
  })

  it('does not count nested subagent rows', () => {
    const blocks: Block[] = [
      {
        kind: 'ledger',
        id: 'l1',
        rows: [
          {
            id: 'parent',
            kind: 'agent',
            target: 'reviewer',
            status: 'ok',
            children: [
              { id: 'child1', kind: 'read', target: 'a.ts', status: 'ok' },
              { id: 'child2', kind: 'read', target: 'b.ts', status: 'ok' },
            ],
          },
        ],
      },
    ]

    expect(navBlocks(blocks).map((entry) => entry.id)).toEqual(['l1:parent'])
  })

  it('lands a checkpoint on the message it belongs to, and shows no entry of its own', () => {
    const blocks: Block[] = [
      { kind: 'checkpoint', id: 'e1', label: 'hello' },
      user('user:e1'),
      agent('a1'),
    ]

    const list = navBlocks(blocks)
    expect(list.map((entry) => entry.id)).toEqual(['user:e1', 'a1'])
    expect(list[0]?.checkpointId).toBe('e1')
    expect(list[1]?.checkpointId).toBeUndefined()
  })

  it('drops a checkpoint that reaches anything but a message first', () => {
    const blocks: Block[] = [
      { kind: 'checkpoint', id: 'e1', label: 'orphan' },
      agent('a1'),
      user('user:e2'),
    ]

    expect(navBlocks(blocks).find((entry) => entry.checkpointId)).toBeUndefined()
  })

  it('keeps each checkpoint with its own message', () => {
    const blocks: Block[] = [
      { kind: 'checkpoint', id: 'e1', label: 'first' },
      user('user:e1'),
      { kind: 'checkpoint', id: 'e2', label: 'second' },
      user('user:e2'),
    ]

    expect(navBlocks(blocks).map((entry) => entry.checkpointId)).toEqual(['e1', 'e2'])
  })

  it('labels cards by what they are about', () => {
    const blocks: Block[] = [
      { kind: 'ask', id: 'q1', question: 'which one?', options: [] },
      { kind: 'approve', id: 'p1', command: 'rm -rf build' },
      { kind: 'compaction', id: 'c1', running: false },
      { kind: 'raw', id: 'x1', rawKind: 'unknown-thing' },
    ]

    expect(navBlocks(blocks).map((entry) => entry.label)).toEqual([
      'which one?',
      'rm -rf build',
      'compaction',
      'unknown-thing',
    ])
  })

  it('shortens a long message and collapses its whitespace', () => {
    const label = navBlocks([user('u1', `a\n\n${'x'.repeat(80)}`)])[0]?.label ?? ''
    expect(label).toHaveLength(40)
    expect(label.endsWith('…')).toBe(true)
    expect(label.includes('\n')).toBe(false)
  })
})

describe('step', () => {
  const list = navBlocks([user('u1'), agent('a1'), user('u2')])

  it('starts at the near end when nothing is focused', () => {
    expect(step(list, null, 1)).toBe('u1')
    expect(step(list, null, -1)).toBe('u2')
  })

  it('clamps rather than wrapping', () => {
    expect(step(list, 'u1', -1)).toBe('u1')
    expect(step(list, 'u2', 1)).toBe('u2')
  })

  it('moves one at a time', () => {
    expect(step(list, 'u1', 1)).toBe('a1')
    expect(step(list, 'a1', -1)).toBe('u1')
  })

  it('recovers when the focused block is gone', () => {
    expect(step(list, 'vanished', 1)).toBe('u1')
    expect(step(list, 'vanished', -1)).toBe('u2')
  })

  it('has nothing to move to in an empty thread', () => {
    expect(step([], null, 1)).toBeNull()
  })
})
