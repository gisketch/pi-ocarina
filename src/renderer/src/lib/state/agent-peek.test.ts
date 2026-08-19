import type { ThreadId } from '../../../../shared/thread-id'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agentPeek } from './agent-peek.svelte'
import { blockFocus } from './block-focus.svelte'
import { threads } from './threads.svelte'
import { EMPTY_THREAD, type AgentEntry, type ToolRow } from '../thread'

const entry = (id: string, extra: Partial<AgentEntry> = {}): AgentEntry => ({
  id,
  name: 'circe',
  role: 'scout',
  label: 'find callers',
  status: 'running',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  startedAt: 0,
  ...extra,
})

const agentRow = (id: string, children: ToolRow[] = [], extra?: Partial<AgentEntry>): ToolRow => ({
  id,
  kind: 'agent',
  target: '',
  status: 'running',
  agent: entry(id, extra),
  children,
})

function seed(rows: ToolRow[]): void {
  threads.seed('t1', {
    ...EMPTY_THREAD,
    blocks: [{ kind: 'ledger', id: 'led-1', rows }],
  })
}

beforeEach(() => {
  agentPeek.close()
  blockFocus.set('t1', null)
})

describe('opening the peek', () => {
  it('opens on the focused agent row', () => {
    seed([agentRow('c1')])
    expect(agentPeek.openAt('t1' as ThreadId, 'led-1:c1')).toBe(true)
    expect(agentPeek.peeked?.entry.name).toBe('circe')
  })

  it('refuses a row that is not an agent, so `l` still moves columns', () => {
    seed([{ id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' }])
    expect(agentPeek.openAt('t1' as ThreadId, 'led-1:r1')).toBe(false)
    expect(agentPeek.open).toBe(false)
  })

  it('refuses when nothing is focused', () => {
    seed([agentRow('c1')])
    expect(agentPeek.openAt('t1' as ThreadId, null)).toBe(false)
  })

  it('finds a grandchild, which is as deep as the tree goes', () => {
    seed([agentRow('c1', [agentRow('g1')])])
    expect(agentPeek.openAt('t1' as ThreadId, 'led-1:g1')).toBe(true)
  })

  it('reads the rows fresh, so a child still working keeps moving', () => {
    seed([agentRow('c1')])
    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')
    expect(agentPeek.peeked?.rows).toEqual([])

    seed([agentRow('c1', [{ id: 'r1', kind: 'read', target: 'a.ts', status: 'running' }])])
    expect(agentPeek.peeked?.rows.map((row) => row.id)).toEqual(['r1'])
  })

  it('closes itself when the row it points at is gone', () => {
    seed([agentRow('c1')])
    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')

    seed([])
    expect(agentPeek.peeked).toBeNull()
  })
})

describe('the keys the peek owns', () => {
  const key = (k: string) => ({ key: k })

  it('descends on `l` only when an agent row is focused', () => {
    seed([agentRow('c1')])
    blockFocus.set('t1', 'led-1:c1')
    expect(agentPeek.handleKey(key('l'), 'OCARINA', 't1' as ThreadId)).toBe(true)
    expect(agentPeek.open).toBe(true)
  })

  it('leaves `l` alone in front of an ordinary row', () => {
    seed([{ id: 'r1', kind: 'read', target: 'a.ts', status: 'ok' }])
    blockFocus.set('t1', 'led-1:r1')
    expect(agentPeek.handleKey(key('l'), 'OCARINA', 't1' as ThreadId)).toBe(false)
  })

  it('closes on `h` and on escape', () => {
    seed([agentRow('c1')])
    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')
    expect(agentPeek.handleKey(key('h'), 'OCARINA', 't1' as ThreadId)).toBe(true)
    expect(agentPeek.open).toBe(false)

    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')
    expect(agentPeek.handleKey(key('Escape'), 'OCARINA', 't1' as ThreadId)).toBe(true)
    expect(agentPeek.open).toBe(false)
  })

  it('lets every other key through, so the peek is not a mode', () => {
    seed([agentRow('c1')])
    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')
    expect(agentPeek.handleKey(key('j'), 'OCARINA', 't1' as ThreadId)).toBe(false)
    expect(agentPeek.open).toBe(true)
  })

  it('keeps its hands off the composer', () => {
    seed([agentRow('c1')])
    blockFocus.set('t1', 'led-1:c1')
    expect(agentPeek.handleKey(key('l'), 'CHAT', 't1' as ThreadId)).toBe(false)
  })

  it('ignores a modified key, so ⌘L is not a descent', () => {
    seed([agentRow('c1')])
    blockFocus.set('t1', 'led-1:c1')
    expect(agentPeek.handleKey({ key: 'l', metaKey: true }, 'OCARINA', 't1' as ThreadId)).toBe(false)
  })
})

describe('stopping the child being watched', () => {
  it('asks first, and does nothing when the answer is no', async () => {
    seed([agentRow('c1')])
    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')

    const { confirm } = await import('./confirm.svelte')
    const { session } = await import('../session')
    vi.spyOn(confirm, 'ask').mockResolvedValue(false)
    const invoke = vi.spyOn(session, 'invoke')

    await agentPeek.stop()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('stops only this child, leaving the turn open', async () => {
    seed([agentRow('c1')])
    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')

    const { confirm } = await import('./confirm.svelte')
    const { session } = await import('../session')
    vi.spyOn(confirm, 'ask').mockResolvedValue(true)
    const invoke = vi.spyOn(session, 'invoke').mockResolvedValue({ ok: true } as never)

    await agentPeek.stop()
    expect(invoke).toHaveBeenCalledWith('cancelAgent', { threadId: 't1', agentId: 'c1' })
  })

  it('will not stop a child that has already settled', async () => {
    seed([agentRow('c1', [], { status: 'ok', endedAt: 1 })])
    agentPeek.openAt('t1' as ThreadId, 'led-1:c1')

    const { confirm } = await import('./confirm.svelte')
    const asked = vi.spyOn(confirm, 'ask')

    await agentPeek.stop()
    expect(asked).not.toHaveBeenCalled()
  })
})
