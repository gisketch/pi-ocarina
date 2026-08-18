import { beforeEach, describe, expect, it } from 'vitest'
import { permission } from './permission.svelte'

/** Unwired, which is the browser harness: the state holds the level itself so
 *  the row can be moved and reviewed against the design. */
beforeEach(async () => {
  await permission.load('w1')
  await permission.set(undefined)
})

describe('the workspace row', () => {
  it('says what it inherits, and from where', () => {
    expect(permission.workspace).toBeUndefined()
    expect(permission.row).toBe('inherit — auto')
  })

  it('names the level once the workspace sets one', async () => {
    await permission.set('ask')
    expect(permission.row).toBe('ask')
    expect(permission.level).toBe('ask')
  })

  it('cycles inherit, ask, auto, full, and back', async () => {
    const seen: string[] = []
    for (let i = 0; i < 4; i += 1) {
      await permission.set(permission.pending)
      seen.push(permission.row)
    }
    expect(seen).toEqual(['ask', 'auto', 'full access', 'inherit — auto'])
  })

  it('names full access before it is switched on, so the question can', () => {
    // What the confirmation reads to decide whether to ask.
    expect(permission.pending).toBe('ask')
  })
})
