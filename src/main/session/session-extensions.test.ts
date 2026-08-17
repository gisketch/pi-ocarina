import { describe, expect, it } from 'vitest'
import { canSpawn } from './session-extensions'

/** The two rules that bound the tree, in the one function that enforces both.
 *
 *  Neither is enforced anywhere else: a session that is handed the tool can use
 *  it, so "may not spawn" means "was never given the tool". That makes this the
 *  whole of the depth limit and the whole of the inline-child escalation guard,
 *  and it had no test until the review said so. */
describe('who may spawn children', () => {
  it('lets a thread spawn', () => {
    expect(canSpawn(0, true)).toBe(true)
  })

  it('lets a child with a saved role spawn its own', () => {
    expect(canSpawn(1, true)).toBe(true)
  })

  it('stops a grandchild, so the tree is two levels deep', () => {
    expect(canSpawn(2, true)).toBe(false)
    expect(canSpawn(3, true)).toBe(false)
  })

  it('stops an inline child at any depth', () => {
    // An inline prompt is held to read-only tools by decision 13. A child it
    // started could hold a `developer` role and write, which is the escalation
    // this closes.
    expect(canSpawn(1, false)).toBe(false)
    expect(canSpawn(0, false)).toBe(false)
  })
})
