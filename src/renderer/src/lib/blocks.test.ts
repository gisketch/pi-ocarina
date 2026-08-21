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

    // A mixed run groups now, so a closed ledger is one stop; opening the
    // group is what puts its members on the list.
    expect(navBlocks(blocks).map((entry) => entry.id)).toEqual(['l1:group:r1'])
    expect(navBlocks(blocks, () => true).map((entry) => entry.id)).toEqual([
      'l1:group:r1',
      'l1:r1',
      'l1:r2',
      'l1:r3',
    ])
    expect(navBlocks(blocks, () => true)[1]).toMatchObject({
      kind: 'tool',
      blockId: 'l1',
      rowId: 'r1',
    })
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

  it('lands a live checkpoint on the message it followed', () => {
    // A live turn emits the message from the driver before pi is asked, and
    // the checkpoint arrives afterwards. This is the ordering people are
    // looking at during the session they are living in.
    const blocks: Block[] = [
      user('user-1'),
      { kind: 'checkpoint', id: 'e1', label: 'hello' },
      agent('a1'),
    ]

    const list = navBlocks(blocks)
    expect(list.map((entry) => entry.id)).toEqual(['user-1', 'a1'])
    expect(list[0]?.checkpointId).toBe('e1')
  })

  it('does not let a checkpoint reach past a message that produced nothing', () => {
    // A turn that failed at once leaves two messages in a row with one
    // checkpoint between them. It belongs to the first: labelling the second
    // with it would rewind further back than the reader is pointing.
    const blocks: Block[] = [
      user('user-1', 'first'),
      { kind: 'checkpoint', id: 'e1', label: 'first' },
      user('user-2', 'second'),
    ]

    const list = navBlocks(blocks)
    expect(list[0]?.checkpointId).toBe('e1')
    expect(list[1]?.checkpointId).toBeUndefined()
  })

  it('lands a replayed checkpoint on the message it precedes', () => {
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

  it('keeps each checkpoint with its own message, whichever order they arrive in', () => {
    const replayed: Block[] = [
      { kind: 'checkpoint', id: 'e1', label: 'first' },
      user('user:e1'),
      { kind: 'checkpoint', id: 'e2', label: 'second' },
      user('user:e2'),
    ]
    expect(navBlocks(replayed).map((entry) => entry.checkpointId)).toEqual(['e1', 'e2'])

    const live: Block[] = [
      user('user-1'),
      { kind: 'checkpoint', id: 'e1', label: 'first' },
      agent('a1'),
      user('user-2'),
      { kind: 'checkpoint', id: 'e2', label: 'second' },
    ]
    expect(navBlocks(live).map((entry) => entry.checkpointId)).toEqual(['e1', undefined, 'e2'])
  })

  it('copies a card in full, however short its label has to be', () => {
    const command = 'pnpm vitest run src/renderer/src/lib/state/block-focus.test.ts'
    const [entry] = navBlocks([{ kind: 'approve', id: 'p1', command }])

    expect(entry.text).toBe(command)
    expect(entry.label).toHaveLength(40)
  })

  it('labels cards by what they are about', () => {
    const blocks: Block[] = [
      { kind: 'ask', id: 'q1', questions: [{ id: 'a', kind: 'one', prompt: 'which one?' }] },
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

describe('the accordion layer', () => {
  const groups = (): Parameters<typeof navBlocks>[1] => () => true
  const accordion = (over: { resolved?: boolean; open?: boolean } = {}) => ({
    resolved: () => over.resolved ?? true,
    open: () => over.open ?? false,
  })
  const turnBlocks: Block[] = [
    user('u1'),
    {
      kind: 'ledger',
      id: 'l1',
      rows: [{ id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' }],
    },
    agent('a1'),
  ]

  it('does not exist when no callback is given', () => {
    expect(navBlocks(turnBlocks, groups()).map((entry) => entry.id)).toEqual([
      'u1',
      'l1:r1',
      'a1',
    ])
  })

  it('a closed turn is one header stop; its work is not on the list', () => {
    const ids = navBlocks(turnBlocks, groups(), accordion()).map((entry) => entry.id)
    expect(ids).toEqual(['u1', 'accordion:u1', 'a1'])
  })

  it('an open turn keeps the header and puts the work back', () => {
    const ids = navBlocks(turnBlocks, groups(), accordion({ open: true })).map((entry) => entry.id)
    expect(ids).toEqual(['u1', 'accordion:u1', 'l1:r1', 'a1'])
  })

  it('a turn with no work registers no header', () => {
    const ids = navBlocks([user('u1'), agent('a1')], groups(), accordion()).map(
      (entry) => entry.id,
    )
    expect(ids).toEqual(['u1', 'a1'])
  })

  it('an unresolved turn with no work yet still registers its header', () => {
    // The header is drawn the moment a turn begins — the stop list must
    // agree, or the ring skips a visible row (`accordionDrawn` is the one
    // rule both obey).
    const ids = navBlocks(
      [user('u1')],
      groups(),
      accordion({ resolved: false, open: true }),
    ).map((entry) => entry.id)
    expect(ids).toEqual(['u1', 'accordion:u1'])
  })

  it('a checkpoint inside a closed turn still rides to the next user message', () => {
    const blocks: Block[] = [
      user('u1'),
      {
        kind: 'ledger',
        id: 'l1',
        rows: [{ id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' }],
      },
      { kind: 'checkpoint', id: 'c1', label: 'restore' },
      user('u2'),
      agent('a2'),
    ]

    const entries = navBlocks(blocks, groups(), accordion())
    expect(entries.find((entry) => entry.id === 'u2')?.checkpointId).toBe('c1')
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


describe('what a segment calls itself', () => {
  it('names the kind, because a bare source does not read as one', () => {
    const text = 'words\n\n![a](https://x.test/s.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |'
    const labels = navBlocks([{ kind: 'agent', id: 'a1', text }]).map((entry) => entry.label)

    expect(labels[1].startsWith('image ')).toBe(true)
    expect(labels[2].startsWith('table ')).toBe(true)
  })
})

describe('a row that changed a file', () => {
  it('carries the path the viewer should open at', () => {
    const blocks: Block[] = [
      {
        kind: 'ledger',
        id: 'l1',
        rows: [
          {
            id: 'r1',
            kind: 'edit',
            target: 'src/a.ts',
            status: 'ok',
            body: { type: 'diff', lines: [{ sign: '+', text: 'x', line: 1 }] },
          },
        ],
      },
    ]

    expect(navBlocks(blocks)[0].diffPath).toBe('src/a.ts')
  })

  it('leaves a row that changed nothing without one', () => {
    // A read has a path too. Offering the viewer there would open it on
    // nothing.
    const blocks: Block[] = [
      { kind: 'ledger', id: 'l1', rows: [{ id: 'r1', kind: 'read', target: 'src/a.ts', status: 'ok' }] },
    ]

    expect(navBlocks(blocks)[0].diffPath).toBeUndefined()
  })
})

describe('a thought as somewhere to leap', () => {
  it('reads the thought from the body, since the row carries nothing', () => {
    const blocks: Block[] = [
      {
        kind: 'ledger',
        id: 'l1',
        rows: [
          {
            id: 't1',
            kind: 'think',
            target: '',
            status: 'ok',
            body: { type: 'thought', text: 'the dequeue path takes the lock per item' },
          },
        ],
      },
    ]

    const [entry] = navBlocks(blocks)
    expect(entry.text).toBe('the dequeue path takes the lock per item')
    expect(entry.label).toContain('dequeue')
  })

  it('still reads a plain row from its target', () => {
    const blocks: Block[] = [
      { kind: 'ledger', id: 'l1', rows: [{ id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' }] },
    ]

    expect(navBlocks(blocks)[0].text).toBe('a.ts')
  })
})
