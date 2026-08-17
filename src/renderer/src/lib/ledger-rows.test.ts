import { describe, expect, it } from 'vitest'
import { drawnChildren, hiddenUnder, kindsIn, pointableRows, SHOWN_CALLS, tailOf } from './ledger-rows'
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

describe('how many of a child’s calls the transcript shows', () => {
  const calls = (count: number): ToolRow[] =>
    Array.from({ length: count }, (_, at) => tool(`r${at}`))

  it('shows everything when there is little', () => {
    const { hidden, shown } = tailOf(calls(3))
    expect(hidden).toBe(0)
    expect(shown).toHaveLength(3)
  })

  it('shows everything at exactly the limit', () => {
    expect(tailOf(calls(SHOWN_CALLS)).hidden).toBe(0)
  })

  it('keeps the newest, because that is what a reader is looking for', () => {
    const { hidden, shown } = tailOf(calls(12))
    expect(hidden).toBe(7)
    expect(shown.map((row) => row.id)).toEqual(['r7', 'r8', 'r9', 'r10', 'r11'])
  })

  it('counts what it hid, so nothing goes missing silently', () => {
    const { hidden, shown } = tailOf(calls(30))
    expect(hidden + shown.length).toBe(30)
  })

  it('takes a limit of its own', () => {
    expect(tailOf(calls(10), 2).shown.map((row) => row.id)).toEqual(['r8', 'r9'])
  })
})

describe('what the transcript actually draws under a child', () => {
  const calls = (count: number): ToolRow[] =>
    Array.from({ length: count }, (_, at) => tool(`r${at}`))

  it('caps a child’s plain calls at the newest five', () => {
    const row = child('c1', calls(9))
    expect(drawnChildren(row).map((one) => one.id)).toEqual(['r4', 'r5', 'r6', 'r7', 'r8'])
    expect(hiddenUnder(row)).toBe(4)
  })

  it('never hides a nested agent, which is a stop and the way into the peek', () => {
    const row = child('c1', [...calls(9), child('g1')])
    const drawn = drawnChildren(row).map((one) => one.id)

    expect(drawn).toContain('g1')
    expect(pointableRows([row]).map((one) => one.id)).toContain('g1')
  })

  it('keeps the drawn order, so the list still reads as a sequence', () => {
    const row = child('c1', [child('g1'), ...calls(9)])
    expect(drawnChildren(row)[0].id).toBe('g1')
  })

  it('never lets navigation land on a row the transcript hid', () => {
    // A stop that is not drawn is a `j` that appears to do nothing.
    const row = child('c1', calls(9))
    const stops = pointableRows([row]).map((one) => one.id)
    const drawn = new Set([row.id, ...drawnChildren(row).map((one) => one.id)])

    for (const stop of stops) expect(drawn.has(stop)).toBe(true)
  })

  it('leaves a plain tool row’s children alone', () => {
    const row = tool('t1', calls(9))
    expect(drawnChildren(row)).toHaveLength(9)
    expect(hiddenUnder(row)).toBe(0)
  })
})
