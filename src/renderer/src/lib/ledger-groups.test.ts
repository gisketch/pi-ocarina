import { describe, expect, it } from 'vitest'
import { groupRows, groupShown, rowsOf, type LedgerItem } from './ledger-groups'
import type { ToolKind, ToolRow, ToolStatus } from './thread'

let next = 0
const row = (kind: ToolKind, target: string, over: Partial<ToolRow> = {}): ToolRow => ({
  id: `r${(next += 1)}`,
  kind,
  target,
  status: 'ok' as ToolStatus,
  ...over,
})

const shape = (items: LedgerItem[]): string[] =>
  items.map((one) => (one.kind === 'group' ? `${one.tool}×${one.rows.length}` : one.row.kind))

describe('what groups', () => {
  it('collapses a run of the same kind', () => {
    const items = groupRows([
      row('read', 'src/a.ts'),
      row('read', 'src/b.ts'),
      row('read', 'src/c.ts'),
    ])

    expect(shape(items)).toEqual(['read×3'])
  })

  it('leaves a single call exactly as it was', () => {
    expect(shape(groupRows([row('read', 'a.ts')]))).toEqual(['read'])
  })

  it('breaks a run when the kind changes', () => {
    const items = groupRows([
      row('read', 'a.ts'),
      row('read', 'b.ts'),
      row('bash', 'pnpm test'),
      row('lsp', 'draw'),
      row('lsp', 'run'),
    ])

    expect(shape(items)).toEqual(['read×2', 'bash', 'lsp×2'])
  })

  it('never groups a kind whose calls are each their own event', () => {
    // Two commands in a row are two different things that happened.
    expect(shape(groupRows([row('bash', 'a'), row('bash', 'b')]))).toEqual(['bash', 'bash'])
  })

  it('groups lsp calls across their operations', () => {
    const items = groupRows([
      row('lsp', 'worker.ts', { detail: 'outline' }),
      row('lsp', 'withRetry', { detail: 'references' }),
    ])

    expect(shape(items)).toEqual(['lsp×2'])
  })
})

describe('what a failure does to a run', () => {
  it('stays a full row rather than joining a summary', () => {
    const items = groupRows([
      row('read', 'a.ts'),
      row('read', 'b.ts'),
      row('read', 'c.ts', { status: 'fail' }),
      row('read', 'd.ts'),
      row('read', 'e.ts'),
    ])

    expect(shape(items)).toEqual(['read×2', 'read', 'read×2'])
  })

  it('does the same for a denied and a cancelled call', () => {
    for (const status of ['denied', 'cancelled'] as ToolStatus[]) {
      const items = groupRows([row('read', 'a.ts'), row('read', 'b.ts', { status })])
      expect(shape(items)).toEqual(['read', 'read'])
    }
  })

  it('leaves a row with nested children whole', () => {
    const child = row('read', 'inner.ts')
    const items = groupRows([
      row('read', 'a.ts'),
      row('read', 'b.ts', { children: [child] }),
    ])

    expect(shape(items)).toEqual(['read', 'read'])
  })
})

describe('what a group says', () => {
  it('names the first three targets and counts the rest', () => {
    const items = groupRows([
      row('read', 'src/sync/worker.ts'),
      row('read', 'src/sync/retry.ts'),
      row('read', 'src/queue/heap.ts'),
      row('read', 'src/sync/types.ts'),
    ])

    expect(items[0].kind === 'group' && items[0].preview).toBe('worker.ts · retry.ts · heap.ts +1')
  })

  it('sums lines read', () => {
    const items = groupRows([
      row('read', 'a.ts', { meta: '142L' }),
      row('read', 'b.ts', { meta: '38L' }),
    ])

    expect(items[0].kind === 'group' && items[0].meta).toBe('180L')
  })

  it('sums diff counters', () => {
    const items = groupRows([
      row('edit', 'a.ts', { meta: '+14 −3' }),
      row('edit', 'b.ts', { meta: '+22' }),
    ])

    expect(items[0].kind === 'group' && items[0].meta).toBe('+36 −3')
  })

  it('says nothing rather than inventing a total it cannot add', () => {
    const items = groupRows([
      row('lsp', 'draw', { meta: '6 refs · 3 files' }),
      row('lsp', 'run', { meta: 'clean' }),
    ])

    expect(items[0].kind === 'group' && items[0].meta).toBe('')
  })

  it('is live while its newest member is still running', () => {
    const live = groupRows([row('lsp', 'a'), row('lsp', 'b', { status: 'running' })])
    const done = groupRows([row('lsp', 'a'), row('lsp', 'b')])

    expect(live[0].kind === 'group' && live[0].live).toBe(true)
    expect(done[0].kind === 'group' && done[0].live).toBe(false)
  })

  it('keeps its id as the run grows, so an opened group stays open', () => {
    const first = groupRows([row('read', 'a.ts'), row('read', 'b.ts')])
    const id = first[0].kind === 'group' ? first[0].id : ''

    const grown = groupRows([
      ...(first[0].kind === 'group' ? first[0].rows : []),
      row('read', 'c.ts'),
    ])

    expect(grown[0].kind === 'group' && grown[0].id).toBe(id)
  })
})

describe('what the projection may never do', () => {
  it('reproduces every row exactly once, in order', () => {
    const rows = [
      row('read', 'a.ts'),
      row('read', 'b.ts'),
      row('bash', 'test'),
      row('edit', 'c.ts', { status: 'fail' }),
      row('lsp', 'draw'),
      row('lsp', 'run'),
      row('lsp', 'walk', { status: 'running' }),
      row('write', 'd.ts'),
    ]

    expect(groupRows(rows).flatMap(rowsOf)).toEqual(rows)
  })

  it('survives an empty ledger', () => {
    expect(groupRows([])).toEqual([])
  })
})

describe('who decides whether a group is open', () => {
  it('is live by default while a member is still running', () => {
    const [group] = groupRows([row('lsp', 'a'), row('lsp', 'b', { status: 'running' })])
    expect(group.kind === 'group' && groupShown(group, (fallback) => fallback)).toBe(true)
  })

  it('is closed by default once the run finishes', () => {
    const [group] = groupRows([row('lsp', 'a'), row('lsp', 'b')])
    expect(group.kind === 'group' && groupShown(group, (fallback) => fallback)).toBe(false)
  })

  it('obeys a reader who shut a live one', () => {
    const [group] = groupRows([row('read', 'a'), row('read', 'b', { status: 'running' })])
    expect(group.kind === 'group' && groupShown(group, () => false)).toBe(false)
  })

  it('is live while any member runs, not only the newest', () => {
    // Tools run in parallel: a run can settle its last call while an earlier
    // one is still in flight, and collapsing then hides the only live call.
    const [group] = groupRows([row('lsp', 'a', { status: 'running' }), row('lsp', 'b')])
    expect(group.kind === 'group' && group.live).toBe(true)
  })
})
