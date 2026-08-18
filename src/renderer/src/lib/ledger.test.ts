import { describe, expect, it } from 'vitest'
import { chevron, initialOpenState, labelTone, metaSegments, metaTone, nodeTone } from './ledger'
import { parseInline } from './thread'
import type { ToolRow } from './thread'
import { blocksFor } from './mock/threads'

const row = (over: Partial<ToolRow> = {}): ToolRow => ({
  id: 'r',
  kind: 'bash',
  target: 'pnpm test',
  status: 'plain',
  ...over,
})

describe('ledger tones', () => {
  it('pulses running rows in the accent', () => {
    expect(nodeTone(row({ status: 'running' }))).toBe('accent')
    expect(labelTone(row({ status: 'running' }))).toBe('accent')
  })

  it('marks failures and denials red', () => {
    expect(nodeTone(row({ status: 'fail' }))).toBe('err')
    expect(nodeTone(row({ status: 'denied' }))).toBe('err')
    expect(labelTone(row({ status: 'fail' }))).toBe('err')
  })

  it('dims a cancelled row rather than treating it as a failure', () => {
    // Cancelling is the user's own decision, not something that went wrong.
    expect(nodeTone(row({ status: 'cancelled' }))).toBe('dim')
    expect(labelTone(row({ status: 'cancelled' }))).not.toBe('err')
  })

  it('keeps writes and edits accent but successful commands green', () => {
    expect(nodeTone(row({ kind: 'write', status: 'ok' }))).toBe('accent')
    expect(nodeTone(row({ kind: 'edit', status: 'ok' }))).toBe('accent')
    expect(nodeTone(row({ kind: 'bash', status: 'ok' }))).toBe('ok')
    expect(metaTone(row({ kind: 'bash', status: 'ok' }))).toBe('ok')
  })

  it('leaves plain reads muted', () => {
    expect(nodeTone(row({ kind: 'read' }))).toBe('muted')
    expect(labelTone(row({ kind: 'read' }))).toBe('muted')
    expect(metaTone(row({ kind: 'read' }))).toBe('dim')
  })
})

describe('metaSegments', () => {
  it('colours diff counters independently', () => {
    expect(metaSegments('+14 −3').filter((s) => s.text.trim())).toEqual([
      { text: '+14', tone: 'ok' },
      { text: '−3', tone: 'err' },
    ])
  })

  it('colours an added-file summary', () => {
    const segments = metaSegments('+38L new file').filter((s) => s.text.trim())
    expect(segments[0]).toEqual({ text: '+38L', tone: 'ok' })
    expect(segments.slice(1).every((s) => s.tone === null)).toBe(true)
  })

  it('leaves ordinary summaries untinted', () => {
    expect(metaSegments('142L').filter((s) => s.text.trim())).toEqual([
      { text: '142L', tone: null },
    ])
    expect(metaSegments('exit 0 · 3.2s').every((s) => s.tone === null)).toBe(true)
  })

  it('preserves spacing so the summary reads unchanged', () => {
    expect(
      metaSegments('+14 −3')
        .map((s) => s.text)
        .join(''),
    ).toBe('+14 −3')
  })
})

describe('expansion state', () => {
  it('honours each row default and ignores rows without a body', () => {
    const rows: ToolRow[] = [
      row({ id: 'open', body: { type: 'todo', items: [] }, open: true }),
      row({ id: 'closed', body: { type: 'todo', items: [] } }),
      row({ id: 'plain' }),
    ]
    expect(initialOpenState(rows)).toEqual({ open: true, closed: false })
  })

  it('includes nested subagent rows', () => {
    const rows: ToolRow[] = [
      row({ id: 'agent', kind: 'agent', children: [row({ id: 'child', body: { type: 'todo', items: [] } })] }),
    ]
    expect(initialOpenState(rows)).toEqual({ child: false })
  })

  it('points the chevron at the state', () => {
    expect(chevron(true)).toBe('▾')
    expect(chevron(false)).toBe('▸')
  })
})

describe('parseInline', () => {
  it('splits inline code out of prose', () => {
    expect(parseInline('Wrapping `runSync()` in a loop')).toEqual([
      { text: 'Wrapping ', code: false },
      { text: 'runSync()', code: true },
      { text: ' in a loop', code: false },
    ])
  })

  it('returns a single segment when there is no code', () => {
    expect(parseInline('plain text')).toEqual([{ text: 'plain text', code: false }])
  })

  it('drops empty segments', () => {
    expect(parseInline('`code`')).toEqual([{ text: 'code', code: true }])
  })
})

describe('thread fixtures', () => {
  it('covers every reference thread', () => {
    for (const id of ['retry-backoff', 'flaky-e2e', 'queue-refactor', 'palette-flicker', 'icon-audit']) {
      expect(blocksFor(id).length, id).toBeGreaterThan(0)
    }
  })

  it('returns an empty thread for unknown ids rather than throwing', () => {
    expect(blocksFor('nope')).toEqual([])
  })

  it('exercises every tool row kind and body type across the fixtures', () => {
    const rows = Object.values(['retry-backoff', 'flaky-e2e', 'queue-refactor', 'palette-flicker', 'icon-audit'])
      .flatMap((id) => blocksFor(id))
      .filter((b) => b.kind === 'ledger')
      .flatMap((b) => (b.kind === 'ledger' ? b.rows : []))

    const kinds = new Set(rows.map((r) => r.kind))
    expect([...kinds].sort()).toEqual(['bash', 'edit', 'fetch', 'grep', 'read', 'todo', 'write'])

    const bodies = new Set(rows.filter((r) => r.body).map((r) => r.body!.type))
    expect([...bodies].sort()).toEqual(['code', 'diff', 'matches', 'terminal', 'todo'])

    const statuses = new Set(rows.map((r) => r.status))
    expect(statuses.has('running')).toBe(true)
    expect(statuses.has('fail')).toBe(true)
    expect(statuses.has('ok')).toBe(true)
  })
})

describe('a summary that counts problems', () => {
  it('colours a count and its word as one fact', () => {
    expect(metaSegments('2 errors 5 warns')).toEqual([
      { text: '2 errors', tone: 'err' },
      { text: ' ', tone: null },
      { text: '5 warns', tone: 'warn' },
    ])
  })

  it('leaves the rest of the summary alone', () => {
    // `refs` and `files` are not problems; nothing in this one is coloured.
    expect(metaSegments('6 refs · 3 files').every((one) => one.tone === null)).toBe(true)
  })

  it('still colours diff counters', () => {
    expect(metaSegments('+14 −3')).toEqual([
      { text: '+14', tone: 'ok' },
      { text: ' ', tone: null },
      { text: '−3', tone: 'err' },
    ])
  })

  it('reproduces the summary exactly, whatever is in it', () => {
    for (const meta of ['2 errors 5 warns', '+14 −3', '14 symbols', 'clean', '']) {
      expect(
        metaSegments(meta)
          .map((one) => one.text)
          .join(''),
      ).toBe(meta)
    }
  })
})
