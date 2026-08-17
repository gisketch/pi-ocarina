import { describe, expect, it } from 'vitest'
import { NamePool } from './agent-names'

const POOL = ['odysseus', 'circe', 'zeus']

describe('borrowing a name', () => {
  it('never gives two live children the same one', () => {
    const names = new NamePool()
    expect([names.draw(POOL), names.draw(POOL), names.draw(POOL)]).toEqual(POOL)
  })

  it('gives a released name back out', () => {
    const names = new NamePool()
    names.draw(POOL)
    names.draw(POOL)
    names.release('odysseus')
    expect(names.draw(POOL)).toBe('odysseus')
  })

  it('numbers the spares when the pool runs dry, rather than repeating', () => {
    const names = new NamePool()
    for (const _ of POOL) names.draw(POOL)
    expect(names.draw(POOL)).toBe('agent-1')
    expect(names.draw(POOL)).toBe('agent-2')
  })

  it('still names a child when the pool was emptied entirely', () => {
    const names = new NamePool()
    expect(names.draw([])).toBe('agent-1')
  })

  it('counts what is out', () => {
    const names = new NamePool()
    names.draw(POOL)
    names.draw(POOL)
    expect(names.live).toBe(2)
    names.release('circe')
    expect(names.live).toBe(1)
  })
})
