import { describe, expect, it } from 'vitest'
import type { ToolKind, ToolStatus } from '../../../shared/vocabulary'
import { labelFor, widestLabel } from './tool-label'

const KINDS: ToolKind[] = ['read', 'grep', 'write', 'edit', 'bash', 'fetch', 'todo', 'skill', 'agent', 'raw']

describe('what a row calls itself', () => {
  it('is in the present tense while the call is in flight', () => {
    expect(labelFor('read', 'running')).toBe('reading')
    expect(labelFor('edit', 'running')).toBe('editing')
    expect(labelFor('bash', 'running')).toBe('running')
  })

  it('is in the past tense once the call landed', () => {
    expect(labelFor('read', 'ok')).toBe('read')
    expect(labelFor('edit', 'ok')).toBe('edited')
    expect(labelFor('write', 'ok')).toBe('wrote')
    expect(labelFor('bash', 'ok')).toBe('ran')
  })

  it('does not conjugate by rule', () => {
    // `writed` and `runned` are what a rule would produce, and either would be
    // worse than showing no tense at all.
    expect(labelFor('write', 'ok')).not.toContain('writed')
    expect(labelFor('bash', 'ok')).not.toContain('runned')
  })

  it('refuses the past tense for a call that did not finish', () => {
    // `edited` beside a red node contradicts itself: nothing was edited.
    for (const status of ['fail', 'cancelled', 'denied', 'plain'] as ToolStatus[]) {
      expect(labelFor('edit', status)).toBe('edit')
      expect(labelFor('write', status)).toBe('write')
    }
  })

  it('has a word for every kind in every state', () => {
    for (const kind of KINDS) {
      for (const status of ['running', 'ok', 'fail'] as ToolStatus[]) {
        expect(labelFor(kind, status)).not.toBe('')
      }
    }
  })

  it('says something rather than nothing for a kind it has never met', () => {
    expect(labelFor('teleport' as ToolKind, 'running')).toBe('teleport')
  })
})

describe('how wide the gutter has to be', () => {
  it('measures the widest word a kind could ever wear, not the one it wears now', () => {
    // The point of the whole exercise: sizing to the current text would drag
    // every target sideways the moment `editing` became `edited`.
    expect(widestLabel(['edit'])).toBe('editing'.length)
    expect(widestLabel(['read'])).toBe('reading'.length)
  })

  it('takes the widest across every kind present', () => {
    expect(widestLabel(['read', 'grep'])).toBe('grepping'.length)
  })

  it('is zero for a ledger with no rows', () => {
    expect(widestLabel([])).toBe(0)
  })

  it('ignores a kind it does not know rather than guessing at its width', () => {
    expect(widestLabel(['read', 'teleport' as ToolKind])).toBe('reading'.length)
  })
})
