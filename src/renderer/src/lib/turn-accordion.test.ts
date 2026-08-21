import { describe, expect, it } from 'vitest'
import {
  accordionLabel,
  accordionShown,
  blocksOf,
  hasPendingGate,
  turnResolved,
  turnsOf,
  type TurnItem,
} from './turn-accordion'
import { spansFor } from './thread-progress'
import type { Block, ThreadViewModel } from './thread'

const user = (id: string): Block => ({ kind: 'user', id, text: 'do the thing' })
const agent = (id: string): Block => ({ kind: 'agent', id, text: 'done' })
const ledger = (id: string): Block => ({
  kind: 'ledger',
  id,
  rows: [{ id: `${id}-r1`, kind: 'read', target: 'a.ts', status: 'ok' }],
})

const turn = (item: TurnItem): Extract<TurnItem, { kind: 'turn' }> => {
  if (item.kind !== 'turn') throw new Error('expected a turn')
  return item
}

describe('the partition', () => {
  it('reproduces every block exactly once, in order', () => {
    const blocks = [
      ledger('pre'),
      user('u1'),
      ledger('l1'),
      agent('a1'),
      user('u2'),
      agent('a2'),
      ledger('l2'),
      agent('a3'),
    ]

    expect(turnsOf(blocks).flatMap(blocksOf)).toEqual(blocks)
  })

  it('starts a turn at every user block and keys it on the opener', () => {
    const items = turnsOf([user('u1'), agent('a1'), user('u2'), agent('a2')])

    expect(items.map((item) => item.kind)).toEqual(['turn', 'turn'])
    expect(items.map((item) => (item.kind === 'turn' ? item.id : ''))).toEqual(['u1', 'u2'])
  })

  it('passes blocks before the first user through unpartitioned', () => {
    const items = turnsOf([ledger('pre'), agent('hello'), user('u1'), agent('a1')])

    expect(items.map((item) => item.kind)).toEqual(['block', 'block', 'turn'])
  })

  it('splits the answer from the work: the trailing agent run is final', () => {
    const one = turn(
      turnsOf([user('u1'), ledger('l1'), agent('a1'), ledger('l2'), agent('a2')])[0],
    )

    // a1 spoke mid-work, so it is work; a2 is the answer.
    expect(one.inner.map((block) => block.id)).toEqual(['l1', 'a1', 'l2'])
    expect(one.final.map((block) => block.id)).toEqual(['a2'])
  })

  it('reaches past a checkpoint to keep the answer final', () => {
    const checkpoint: Block = { kind: 'checkpoint', id: 'c1', label: 'restore' }
    const one = turn(turnsOf([user('u1'), ledger('l1'), agent('a1'), checkpoint])[0])

    expect(one.final.map((block) => block.id)).toEqual(['a1', 'c1'])
  })

  it('leaves a turn with no answer all inner', () => {
    const one = turn(turnsOf([user('u1'), ledger('l1')])[0])

    expect(one.inner.map((block) => block.id)).toEqual(['l1'])
    expect(one.final).toEqual([])
  })
})

describe('resolution', () => {
  const one = turn(turnsOf([user('u1'), agent('a1')])[0])

  it('an older turn is always resolved', () => {
    expect(turnResolved(one, 'u2', 'running')).toBe(true)
  })

  it('the newest turn is unresolved while the thread runs or waits', () => {
    expect(turnResolved(one, 'u1', 'running')).toBe(false)
    expect(turnResolved(one, 'u1', 'waiting-input')).toBe(false)
  })

  it('the newest turn resolves when the thread stops, however it stopped', () => {
    for (const state of ['done', 'failed', 'idle'] as const) {
      expect(turnResolved(one, 'u1', state)).toBe(true)
    }
  })
})

describe('what may be hidden', () => {
  const gated = (outcome?: 'allow-once') =>
    turn(
      turnsOf([
        user('u1'),
        { kind: 'approve', id: 'ap1', command: 'rm -rf', ...(outcome ? { outcome } : {}) },
        agent('a1'),
      ])[0],
    )

  it('a pending gate forces the accordion open over every choice', () => {
    expect(hasPendingGate(gated())).toBe(true)
    expect(accordionShown(gated(), true, () => false)).toBe(true)
  })

  it('a resolved gate hides like anything else', () => {
    expect(hasPendingGate(gated('allow-once'))).toBe(false)
    expect(accordionShown(gated('allow-once'), true, (fallback) => fallback)).toBe(false)
  })

  it('unresolved defaults open, resolved defaults closed, the reader wins', () => {
    const one = turn(turnsOf([user('u1'), ledger('l1'), agent('a1')])[0])

    expect(accordionShown(one, false, (fallback) => fallback)).toBe(true)
    expect(accordionShown(one, true, (fallback) => fallback)).toBe(false)
    expect(accordionShown(one, false, () => false)).toBe(false)
    expect(accordionShown(one, true, () => true)).toBe(true)
  })
})

describe('what the row says', () => {
  it('speaks the footer vocabulary', () => {
    expect(accordionLabel('12s', 'running')).toBe('working for 12s')
    expect(accordionLabel('1m39s', 'done')).toBe('worked for 1m39s')
    expect(accordionLabel('40s', 'failed')).toBe('stopped after 40s')
    expect(accordionLabel('40s', 'stopped')).toBe('interrupted after 40s')
  })

  it('says only "worked" for a replayed turn with no clock', () => {
    expect(accordionLabel(null, 'done')).toBe('worked')
  })
})

describe('the span registry', () => {
  const model = (over: Partial<ThreadViewModel>): ThreadViewModel => ({
    blocks: [user('u1'), agent('a1')],
    status: 'idle',
    runState: 'idle',
    pendingAskId: null,
    ...over,
  })

  it('stamps a finished span under the newest user block', () => {
    const ended = { startedAt: 1, endedAt: 5, outcome: 'done' as const }
    const stamped = spansFor(model({ turn: { startedAt: 1 } }), ended)

    expect(stamped).toEqual({ u1: ended })
  })

  it('never stamps a running span', () => {
    expect(spansFor(model({}), { startedAt: 1 })).toBeUndefined()
  })

  it('stamps only the ending transition, never a stale ended span again', () => {
    const ended = { startedAt: 1, endedAt: 5, outcome: 'done' as const }
    const already = model({
      blocks: [user('u1'), agent('a1'), user('u2')],
      turn: ended,
      spans: { u1: ended },
    })

    // The same ended span handed back after u2 arrived must not be refiled
    // under u2.
    expect(spansFor(already, ended)).toEqual({ u1: ended })
  })

  it('keeps earlier turns as later ones finish', () => {
    const first = { startedAt: 1, endedAt: 5, outcome: 'done' as const }
    const second = { startedAt: 9, endedAt: 12, outcome: 'failed' as const }
    const later = model({
      blocks: [user('u1'), agent('a1'), user('u2'), agent('a2')],
      turn: { startedAt: 9 },
      spans: { u1: first },
    })

    expect(spansFor(later, second)).toEqual({ u1: first, u2: second })
  })
})
