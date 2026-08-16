import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leap } from './leap.svelte'
import { registerColumnBody } from './columns'
import { LEAP_LABELS } from '../leap'

/** A column of text, standing in for a painted transcript.
 *
 *  The real walk uses a TreeWalker over text nodes and measures each with a
 *  Range. Both are faked here down to the surface this module actually
 *  touches, so the phase machine — which is where the bugs live — can be
 *  driven without a browser. */
function column(threadId: string, lines: { text: string; navId: string }[]): () => void {
  const nodes = lines.map((line, i) => {
    const node = { data: line.text, parentElement: {} } as unknown as Text
    ;(node as { parentElement: unknown }).parentElement = {
      closest: () => ({ dataset: { navId: line.navId } }),
    }
    return { node, top: i * 20 }
  })

  const body = {
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 400,
    getBoundingClientRect: () => ({ top: 0, bottom: 400, left: 0 }) as DOMRect,
    scrollBy() {},
  }

  vi.stubGlobal('document', {
    createTreeWalker: () => {
      let at = -1
      return {
        nextNode: () => {
          at += 1
          return nodes[at]?.node ?? null
        },
      }
    },
    createRange: () => {
      let owner: { data: string } | null = null
      let from = 0
      return {
        selectNodeContents(node: { data: string }) {
          owner = node
          from = 0
        },
        setStart(node: { data: string }, at: number) {
          owner = node
          from = at
        },
        setEnd() {},
        getBoundingClientRect: () => {
          const line = nodes.find((n) => n.node === (owner as unknown as Text))
          // Characters are 8px wide and lines 20px apart. Enough geometry to
          // tell "on screen" from "not", which is all this module asks.
          const top = line?.top ?? 0
          return { top, bottom: top + 16, left: from * 8, right: from * 8 + 16 } as DOMRect
        },
      }
    },
  })
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('CSS', {})

  return registerColumnBody(threadId, body as unknown as HTMLElement)
}

let release = (): void => {}

beforeEach(() => leap.end())
afterEach(() => {
  release()
  release = () => {}
  vi.unstubAllGlobals()
})

describe('the phases', () => {
  beforeEach(() => {
    release = column('t1', [
      { text: 'This is a sync worker', navId: 'u1' },
      { text: 'runSync in a retry loop', navId: 'a1' },
    ])
  })

  it('paints nothing until the first character', () => {
    leap.start('t1')

    expect(leap.active).toBe(true)
    expect(leap.typed).toBe('')
    expect(leap.targets).toEqual([])
    expect(leap.labelled).toBe(false)
  })

  it('paints every occurrence of one character without labelling any', () => {
    leap.start('t1')
    leap.type('s')

    expect(leap.targets.length).toBeGreaterThan(1)
    expect(leap.labelled).toBe(false)
    expect(leap.labelOf(0)).toBeNull()
  })

  it('narrows and labels on the second character', () => {
    leap.start('t1')
    leap.type('i')
    leap.type('s')

    // "Th[is] [is]" — two matches, two labels, both in the same block.
    expect(leap.targets).toHaveLength(2)
    expect(leap.targets.every((t) => t.navId === 'u1')).toBe(true)
    expect(leap.labelOf(0)).toBe(LEAP_LABELS[0])
    expect(leap.labelOf(1)).toBe(LEAP_LABELS[1])
  })

  it('jumps without a label when the pattern found exactly one match', () => {
    leap.start('t1')
    leap.type('l')
    const only = leap.type('o')

    expect(only).toBe(0)
    expect(leap.targets[0]?.navId).toBe('a1')
  })

  it('ends on a pattern that matches nothing', () => {
    leap.start('t1')
    leap.type('z')

    expect(leap.active).toBe(false)
  })

  it('does not begin on a column that has painted nothing', () => {
    leap.end()
    leap.start('never-drawn')

    expect(leap.active).toBe(false)
  })
})

describe('correcting and paging', () => {
  beforeEach(() => {
    release = column('t1', [{ text: 'This is a sync worker', navId: 'u1' }])
  })

  it('takes back a character on backspace', () => {
    leap.start('t1')
    leap.type('i')
    leap.type('s')
    expect(leap.labelled).toBe(true)

    leap.backspace()

    expect(leap.typed).toBe('i')
    expect(leap.labelled).toBe(false)
  })

  it('ends the mode when there is nothing left to take back', () => {
    leap.start('t1')
    leap.type('i')

    leap.backspace()

    expect(leap.active).toBe(false)
  })

  it('does not page while the pattern is still being typed', () => {
    leap.start('t1')
    leap.type('i')

    leap.page(1)

    expect(leap.group).toBe(0)
  })

  it('resolves a label to its match, and refuses a key that names none', () => {
    leap.start('t1')
    leap.type('i')
    leap.type('s')

    expect(leap.resolve(LEAP_LABELS[1])).toBe(1)
    expect(leap.resolve('1')).toBeNull()
    // Two matches, so the third label names nothing.
    expect(leap.resolve(LEAP_LABELS[2])).toBeNull()
  })
})

describe('smartcase through the mode', () => {
  beforeEach(() => {
    release = column('t1', [{ text: 'runSync and sync', navId: 'u1' }])
  })

  it('matches both cases for a lowercase pattern', () => {
    leap.start('t1')
    leap.type('s')
    leap.type('y')

    expect(leap.targets).toHaveLength(2)
  })

  it('matches exactly once a capital is typed', () => {
    leap.start('t1')
    leap.type('S')
    const only = leap.type('y')

    expect(only).toBe(0)
  })
})

describe('what is out of view', () => {
  it('is never a destination', () => {
    // The third line sits at y=400, level with the fold.
    release = column('t1', [
      { text: 'is one', navId: 'a' },
      { text: 'is two', navId: 'b' },
      ...Array.from({ length: 19 }, (_, i) => ({ text: `filler ${i}`, navId: `f${i}` })),
      { text: 'is far below', navId: 'z' },
    ])

    leap.start('t1')
    leap.type('i')
    leap.type('s')

    expect(leap.targets.map((t) => t.navId)).not.toContain('z')
  })
})
