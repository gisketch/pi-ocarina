import { describe, expect, it } from 'vitest'
import { kindsIn, pointableRows } from './ledger-rows'
import type { AgentEntry, ToolRow } from './thread'

const entry = (name: string): AgentEntry => ({
  id: name,
  name,
  role: 'scout',
  label: 'x',
  status: 'running',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  startedAt: 0,
})

const tool = (id: string, children?: ToolRow[]): ToolRow => ({
  id,
  kind: 'read',
  target: `${id}.ts`,
  status: 'ok',
  children,
})

const child = (id: string, children?: ToolRow[]): ToolRow => ({
  id,
  kind: 'agent',
  target: '',
  status: 'running',
  agent: entry(id),
  children,
})

describe('the kinds a ledger draws', () => {
  it('counts nested rows, so the gutter does not jump when one appears', () => {
    expect(kindsIn([tool('a', [child('c', [tool('r')])])])).toEqual(['read', 'agent', 'read'])
  })

  it('handles a ledger with nothing nested', () => {
    expect(kindsIn([tool('a')])).toEqual(['read'])
  })
})

describe('the rows a reader can point at', () => {
  it('takes the top level', () => {
    expect(pointableRows([tool('a'), tool('b')]).map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('takes a nested child agent, because `l` on it is the way into the peek', () => {
    const rows = pointableRows([tool('spawn', [child('c1'), child('c2')])])
    expect(rows.map((row) => row.id)).toEqual(['spawn', 'c1', 'c2'])
  })

  it('leaves a subagent’s own reads alone', () => {
    // Pointing at a subagent's third read is not something a reader asks for.
    const rows = pointableRows([tool('spawn', [child('c1', [tool('r1'), tool('r2')])])])
    expect(rows.map((row) => row.id)).toEqual(['spawn', 'c1'])
  })

  it('reaches a grandchild, which is as deep as the tree goes', () => {
    const rows = pointableRows([tool('spawn', [child('c1', [child('g1')])])])
    expect(rows.map((row) => row.id)).toEqual(['spawn', 'c1', 'g1'])
  })
})
