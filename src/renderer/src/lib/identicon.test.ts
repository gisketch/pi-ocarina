import { describe, expect, it } from 'vitest'
import { identicon } from './identicon'

/** Fixtures produced by executing the reference implementation
 *  (`px()` in docs/reference/design/PiOcarina Components.dc.html) verbatim.
 *  `#` = light cell, `+` = dark cell, `.` = transparent. */
function art(cells: readonly string[]): string {
  const rows: string[] = []
  for (let r = 0; r < 5; r++) {
    let row = ''
    for (let c = 0; c < 5; c++) {
      const bg = cells[r * 5 + c]
      row += bg === 'transparent' ? '.' : bg.includes('0.78') ? '#' : '+'
    }
    rows.push(row)
  }
  return rows.join('\n')
}

describe('identicon', () => {
  it('matches the reference sigil for pi-core', () => {
    expect(art(identicon('pi-core', 152))).toBe(['##+##', '#.#.#', '#+#+#', '.###.', '#+.+#'].join('\n'))
  })

  it('matches the reference sigil for ocarina-ui', () => {
    expect(art(identicon('ocarina-ui', 265))).toBe(
      ['.....', '+...+', '..#..', '..#..', '.....'].join('\n'),
    )
  })

  it('matches the reference sigil for docs-site', () => {
    expect(art(identicon('docs-site', 45))).toBe(['+#.#+', '#.#.#', '..+..', '.+#+.', '#.+.#'].join('\n'))
  })

  it('emits the exact reference colour strings', () => {
    const cells = identicon('pi-core', 152)
    expect(cells[0]).toBe('oklch(0.78 0.14 152)')
    expect(cells[2]).toBe('oklch(0.58 0.13 152)')
    expect(cells[6]).toBe('transparent')
  })

  it('always returns 25 cells and is horizontally mirrored', () => {
    for (const [name, hue] of [
      ['pi-core', 152],
      ['api-gw', 195],
      ['blog', 345],
    ] as const) {
      const cells = identicon(name, hue)
      expect(cells).toHaveLength(25)
      for (let r = 0; r < 5; r++) {
        expect(cells[r * 5 + 0]).toBe(cells[r * 5 + 4])
        expect(cells[r * 5 + 1]).toBe(cells[r * 5 + 3])
      }
    }
  })

  it('is stable across calls (memoised identity is not observable)', () => {
    expect(identicon('pi-core', 152)).toEqual(identicon('pi-core', 152))
    expect(identicon('pi-core', 152)).not.toEqual(identicon('pi-core', 45))
  })
})
