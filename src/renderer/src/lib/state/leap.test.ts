import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leap } from './leap.svelte'
import { registerColumnBody } from './columns'
import { blockFocus, registerBlock } from './block-focus.svelte'
import { LEAP_LABELS } from '../leap'

/** A column of text, standing in for a painted transcript.
 *
 *  The real walk uses a TreeWalker over text nodes and measures each with a
 *  Range. Both are faked here down to the surface this module actually
 *  touches, so the phase machine — which is where the bugs live — can be
 *  driven without a browser. */
function column(
  threadId: string,
  lines: { text: string; navId: string }[],
  /** Where the column sits on screen and how far it has scrolled. Non-zero by
   *  default so client and content coordinates cannot be confused for each
   *  other — with both at zero, the conversion in `#search` is untested. */
  frame = { top: 40, left: 12, scrollTop: 0 },
): () => void {
  // One block per line, each holding one text node — the shape the walk
  // actually sees: it bisects the scroller's children, then opens only the
  // blocks that are on screen.
  const nodes = lines.map((line, i) => {
    const text = { data: line.text, isConnected: true } as unknown as Text
    const top = i * 20 + frame.top
    const rect = (): DOMRect =>
      ({ top: top - frame.scrollTop, bottom: top + 16 - frame.scrollTop }) as DOMRect

    const block = {
      dataset: { navId: line.navId },
      getBoundingClientRect: rect,
      matches: (selector: string) => selector === '[data-nav-id]',
      querySelectorAll: () => [],
    } as unknown as HTMLElement

    return { text, block, top }
  })

  const body = {
    scrollTop: frame.scrollTop,
    scrollLeft: 0,
    clientHeight: 400,
    children: nodes.map((n) => n.block),
    getBoundingClientRect: () =>
      ({ top: frame.top, bottom: frame.top + 400, left: frame.left }) as DOMRect,
    scrollBy() {},
    addEventListener() {},
    removeEventListener() {},
  }

  vi.stubGlobal('document', {
    createTreeWalker: (root: unknown) => {
      // Rooted at a block, so it yields that block's own text and nothing else.
      const owned = nodes.find((n) => n.block === root)
      let done = false
      return {
        nextNode: () => {
          if (done || !owned) return null
          done = true
          return owned.text
        },
      }
    },
    createRange: () => {
      let owner: Text | null = null
      let from = 0
      return {
        setStart(node: Text, at: number) {
          owner = node
          from = at
        },
        setEnd() {},
        getBoundingClientRect: () => {
          const line = nodes.find((n) => n.text === owner)
          // Laid out in content space, then reported in client space, exactly
          // as a real scroller does. Characters are 8px wide.
          const top = (line?.top ?? 0) - frame.scrollTop
          const left = from * 8 + frame.left
          return { top, bottom: top + 16, left, right: left + 16 } as DOMRect
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


describe('coordinates', () => {
  it('reports chip positions in content space, not screen space', () => {
    // The column sits 40px down the screen and 12px in. A chip belongs where
    // the text is in the column's own content, not where it is on the display.
    release = column('t1', [{ text: 'sync', navId: 'u1' }], { top: 40, left: 12, scrollTop: 0 })

    leap.start('t1')
    leap.type('s')
    leap.type('y')

    expect(leap.targets[0]?.top).toBe(0)
    // The match starts at character 0 and the chip goes past it: 16px along.
    expect(leap.targets[0]?.left).toBe(16)
    release()
  })

  it('is not fooled by how far the column has scrolled', () => {
    // Twenty lines at a 20px pitch, scrolled 200 down: line 10 is the first
    // one in view, and it belongs at content y=200.
    release = column(
      't1',
      Array.from({ length: 20 }, (_, i) => ({ text: `sync ${i}`, navId: `n${i}` })),
      { top: 40, left: 12, scrollTop: 200 },
    )

    leap.start('t1')
    leap.type('s')
    leap.type('y')

    expect(leap.targets[0]?.navId).toBe('n10')
    expect(leap.targets[0]?.top).toBe(200)
    release()
  })
})

describe('nearest first', () => {
  it('gives the easiest label to the match beside the ring', () => {
    release = column('t1', [
      { text: 'sync one', navId: 'a' },
      { text: 'sync two', navId: 'b' },
      { text: 'sync three', navId: 'c' },
    ])
    // The ring is on the third line, so its match should be labelled first.
    blockFocus.set('t1', 'c')
    const off = registerBlock('t1', 'c', {
      getBoundingClientRect: () => ({ top: 40 + 40 }) as DOMRect,
      scrollIntoView() {},
    } as unknown as HTMLElement)

    leap.start('t1')
    leap.type('s')
    leap.type('y')

    expect(leap.targets.map((t) => t.navId)).toEqual(['c', 'b', 'a'])
    off()
    blockFocus.clear('t1')
    release()
  })

  it('measures from the top of the view when there is no ring', () => {
    release = column('t1', [
      { text: 'sync one', navId: 'a' },
      { text: 'sync two', navId: 'b' },
    ])

    leap.start('t1')
    leap.type('s')
    leap.type('y')

    expect(leap.targets.map((t) => t.navId)).toEqual(['a', 'b'])
    release()
  })
})
