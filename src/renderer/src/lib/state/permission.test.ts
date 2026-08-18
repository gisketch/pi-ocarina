import type { ThreadId } from '../../../../shared/thread-id'
import { beforeEach, describe, expect, it } from 'vitest'
import { permission } from './permission.svelte'

/** Unwired, which is the browser harness: the state holds the level itself so
 *  the row can be moved and reviewed against the design. */
beforeEach(async () => {
  await permission.load('w1', 't1' as ThreadId)
  await permission.setThread(undefined)
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

describe('a thread of its own', () => {
  it('starts inheriting its workspace', () => {
    expect(permission.thread).toBeUndefined()
  })

  it('overrides the workspace, and clears back to it', async () => {
    await permission.set('ask')
    expect(permission.level).toBe('ask')

    await permission.setThread('full')
    expect(permission.level).toBe('full')

    await permission.setThread(undefined)
    expect(permission.level).toBe('ask')
    expect(permission.thread).toBeUndefined()
  })

  it('cycles from inherit through the three', async () => {
    const seen: string[] = []
    for (let i = 0; i < 4; i += 1) seen.push(await permission.setThread(permission.pendingThread))
    expect(seen).toEqual(['ask', 'auto', 'full', 'auto'])
  })
})

describe('a column with no thread behind it', () => {
  it('holds no level of its own, and cannot be given one', async () => {
    // `␣p` over the placeholder used to write an override keyed on
    // `fresh:<workspace>`. Main stored it, the bar read it back, and it
    // governed nothing — a permission level the reader believed was in force.
    await permission.load('w1', null)
    expect(permission.thread).toBeUndefined()

    const level = permission.level
    expect(await permission.setThread('full')).toBe(level)
    expect(permission.thread).toBeUndefined()
  })
})
