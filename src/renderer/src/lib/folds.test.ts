import { describe, expect, it } from 'vitest'
import { foldChain } from './folds'
import { navBlocks } from './blocks'
import type { Block } from './thread'

const user = (id: string): Block => ({ kind: 'user', id, text: 'go' })
const agent = (id: string): Block => ({ kind: 'agent', id, text: 'done' })

/** A turn with a two-row group and a lone expandable row inside it. */
const blocks: Block[] = [
  user('u1'),
  {
    kind: 'ledger',
    id: 'l1',
    rows: [
      { id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' },
      { id: 'r2', kind: 'read', target: 'b.ts', status: 'ok' },
      { id: 'r3', kind: 'bash', target: 'pnpm test', status: 'fail', body: { type: 'terminal', lines: [] } },
    ],
  },
  agent('mid'),
  {
    kind: 'ledger',
    id: 'l2',
    rows: [{ id: 'r4', kind: 'grep', target: 'foo', status: 'ok' }],
  },
  agent('a1'),
]

const entries = navBlocks(blocks, () => true, { resolved: () => true, open: () => true })
const entry = (id: string) => {
  const found = entries.find((one) => one.id === id)
  if (!found) throw new Error(`no entry ${id}`)
  return found
}

const shape = (id: string): string[] =>
  foldChain(blocks, entry(id)).map((fold) => `${fold.kind}:${fold.navId}`)

describe('the fold chain, innermost first', () => {
  it('a grandchild names its group before the turn — the parent, never the whole', () => {
    expect(shape('l1:r1')).toEqual(['group:l1:group:r1', 'accordion:accordion:u1'])
  })

  it('an expandable row names its own body first', () => {
    expect(shape('l1:r3')).toEqual(['row:l1:r3', 'accordion:accordion:u1'])
  })

  it('a group header names itself, then the turn', () => {
    expect(shape('l1:group:r1')).toEqual(['group:l1:group:r1', 'accordion:accordion:u1'])
  })

  it('a mid-turn message reaches only the turn around it', () => {
    // `mid` spoke before the answer, so it is inner work.
    expect(shape('mid')).toEqual(['accordion:accordion:u1'])
  })

  it('the accordion header is its own only fold', () => {
    expect(shape('accordion:u1')).toEqual(['accordion:accordion:u1'])
  })

  it('the opener and the answer sit outside every fold', () => {
    expect(shape('u1')).toEqual([])
    expect(shape('a1')).toEqual([])
  })
})
