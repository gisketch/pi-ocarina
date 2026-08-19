import type { ThreadId } from '../../../../shared/thread-id'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../session', () => ({
  session: { invoke: vi.fn().mockResolvedValue({ ok: true }), onEvents: () => () => {} },
}))
vi.mock('./catalog.svelte', () => ({
  catalog: { retitle: vi.fn(), workspaces: [] },
}))

const { renameAsk } = await import('./rename-ask.svelte')

const T1 = 's1' as ThreadId

beforeEach(() => {
  // Close however the last test left it.
  renameAsk.handleKey({ key: 'Escape' })
})

describe('the prefill', () => {
  it('opens selected, and the first character replaces the lot', () => {
    renameAsk.run(T1, 'retry backoff')
    expect(renameAsk.pristine).toBe(true)

    renameAsk.handleKey({ key: 'x' })

    expect(renameAsk.title).toBe('x')
    expect(renameAsk.pristine).toBe(false)
  })

  it('clears whole on Backspace, like a selected name', () => {
    renameAsk.run(T1, 'retry backoff')

    renameAsk.handleKey({ key: 'Backspace' })

    expect(renameAsk.title).toBe('')
  })

  it('takes typing even when the prefill sits at the length cap', () => {
    // The first-line fallback is capped at exactly 80 chars, so this is the
    // common case — and it is the bug that shipped: the field opened full and
    // every keystroke was swallowed.
    renameAsk.run(T1, 'x'.repeat(200))
    expect(renameAsk.title.length).toBeLessThanOrEqual(80)

    renameAsk.handleKey({ key: 'n' })

    expect(renameAsk.title).toBe('n')
  })

  it('edits in place once the selection is broken', () => {
    renameAsk.run(T1, 'ab')
    renameAsk.handleKey({ key: 'Backspace' })
    renameAsk.handleKey({ key: 'c' })
    renameAsk.handleKey({ key: 'd' })

    expect(renameAsk.title).toBe('cd')
  })
})

describe('the keys', () => {
  it('lets a bare modifier pass — reaching for a capital is not an answer', () => {
    renameAsk.run(T1, 'name')
    expect(renameAsk.handleKey({ key: 'Shift' })).toBe(false)
    expect(renameAsk.pristine).toBe(true)
  })

  it('closes on Escape without writing', () => {
    renameAsk.run(T1, 'name')
    renameAsk.handleKey({ key: 'Escape' })

    expect(renameAsk.open).toBe(false)
  })
})
