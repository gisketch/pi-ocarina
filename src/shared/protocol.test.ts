import { describe, expect, it } from 'vitest'
import { isKnownEventKind, normalizeEvent } from './protocol'

describe('normalizeEvent', () => {
  it('passes a known event through untouched', () => {
    const event = { kind: 'tool-end', id: 'x', status: 'ok', meta: '3 matches' }

    expect(normalizeEvent(event)).toBe(event)
  })

  it('turns an unrecognised kind into a visible raw row', () => {
    const result = normalizeEvent({ kind: 'quantum-entangle', payload: 42 })

    expect(result.kind).toBe('raw')
    expect(result).toMatchObject({ rawKind: 'quantum-entangle' })
  })

  it('keeps the original shape in the raw row so nothing is lost', () => {
    const result = normalizeEvent({ kind: 'future-thing', note: 'hello' })

    expect(result.kind === 'raw' && result.detail).toContain('hello')
  })

  it.each([null, undefined, 42, 'tool-end', [], { noKind: true }, { kind: 7 }])(
    'reports %p as malformed rather than throwing',
    (value) => {
      const result = normalizeEvent(value)

      expect(result).toMatchObject({ kind: 'raw', rawKind: 'malformed' })
    },
  )

  it('survives a value JSON cannot stringify', () => {
    const cyclic: Record<string, unknown> = { kind: 'weird' }
    cyclic.self = cyclic

    expect(normalizeEvent(cyclic).kind).toBe('raw')
  })
})

describe('isKnownEventKind', () => {
  it('accepts vocabulary members', () => {
    expect(isKnownEventKind('agent-message-delta')).toBe(true)
    expect(isKnownEventKind('raw')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isKnownEventKind('agent-message')).toBe(false)
    expect(isKnownEventKind('')).toBe(false)
  })
})
