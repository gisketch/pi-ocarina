import { describe, expect, it } from 'vitest'
import { countChanges, diffLines } from './file-diff'

/** What a reader sees, as one string per line: sign, number, text. */
const shown = (before: string, after: string): string[] =>
  diffLines(before, after).map((line) => `${line.sign}${line.line ?? ''} ${line.text}`.trim())

describe('the shape of a change', () => {
  it('says nothing about a file that did not change', () => {
    expect(diffLines('a\nb\n', 'a\nb\n')).toEqual([])
  })

  it('reads a new file as all additions', () => {
    // What `write` produces: there was nothing, and now there is something.
    expect(shown('', 'one\ntwo')).toEqual(['+1 one', '+2 two'])
  })

  it('reads a deleted file as all removals', () => {
    expect(shown('one\ntwo', '')).toEqual(['-1 one', '-2 two'])
  })

  it('puts the removal before the addition when a line is replaced', () => {
    // "was this, now that" — the other order reads as a change to the line
    // above it.
    expect(shown('a\nB\nc', 'a\nb\nc')).toEqual(['1 a', '-2 B', '+2 b', '3 c'])
  })

  it('numbers a removal by where it was and an addition by where it is', () => {
    const lines = diffLines('keep\ngone\nkeep2', 'keep\nkeep2\nadded')
    const removed = lines.find((line) => line.sign === '-')
    const added = lines.find((line) => line.sign === '+')

    expect(removed).toEqual({ sign: '-', text: 'gone', line: 2 })
    expect(added).toEqual({ sign: '+', text: 'added', line: 3 })
  })

  it('counts what changed', () => {
    expect(countChanges(diffLines('a\nb', 'a\nB\nc'))).toEqual({ added: 2, removed: 1 })
  })
})

describe('what it does not draw', () => {
  const long = (count: number, mark = ''): string =>
    Array.from({ length: count }, (_, i) => `line ${i}${mark}`).join('\n')

  it('keeps three lines of context around a change', () => {
    const before = long(40)
    const after = before.replace('line 20', 'line 20 changed')
    const lines = diffLines(before, after)

    const context = lines.filter((line) => line.sign === ' ')
    expect(context).toHaveLength(6)
    expect(context[0].text).toBe('line 17')
    expect(context.at(-1)?.text).toBe('line 23')
  })

  it('marks the unchanged text it skipped rather than hiding it', () => {
    const before = long(40)
    const after = before.replace('line 20', 'line 20 changed')
    const marks = diffLines(before, after).filter((line) => line.sign === '@')

    // One before the change and one after: 17 lines, then 16.
    expect(marks.map((line) => line.text)).toEqual([
      '⋯ 17 unchanged lines',
      '⋯ 16 unchanged lines',
    ])
  })

  it('says one line rather than 1 lines', () => {
    const before = long(9)
    const after = before.replace('line 0', 'changed')
    const mark = diffLines(before, after).find((line) => line.sign === '@')

    expect(mark?.text).toBe('⋯ 5 unchanged lines')
  })

  it('refuses to diff a file that is not written to be read', () => {
    // A minified bundle is one line of half a megabyte. Diffing it costs the
    // main process a stall, and nobody reads the result.
    const huge = 'x'.repeat(500_000)
    const lines = diffLines(huge, `${huge}y`, { path: 'bundle.js' })

    expect(lines).toHaveLength(1)
    expect(lines[0].sign).toBe('@')
    expect(lines[0].text).toContain('bundle.js is too large')
  })

  it('reports a wholesale rewrite rather than matching thousands of lines', () => {
    // The matching is quadratic. A file rewritten end to end is the case where
    // that would be paid in full, for correspondences nobody would read.
    const lines = diffLines(long(1200, ' a'), long(1200, ' b'))

    expect(lines.some((line) => line.sign === '-')).toBe(true)
    expect(lines.some((line) => line.sign === '+')).toBe(true)
  })

  it('stays fast on the edit an agent actually makes', () => {
    const before = long(4000)
    const after = before.replace('line 2000', 'line 2000 changed')

    const started = performance.now()
    diffLines(before, after)
    expect(performance.now() - started).toBeLessThan(50)
  })
})

describe('files that end awkwardly', () => {
  it('does not invent a line for a trailing newline', () => {
    expect(shown('a\n', 'a\nb\n')).toEqual(['1 a', '+2 b'])
  })

  it('reports a newline that appeared or vanished at the end', () => {
    // Dropping the phantom line would otherwise lose a real difference.
    // Nothing else is drawn: no line changed, so there is no context to keep.
    expect(shown('a\nb', 'a\nb\n')).toEqual(['@ newline added at end of file'])
    expect(shown('a\nb\n', 'a\nb')).toEqual(['@ no newline at end of file'])
  })

  it('handles a file with no trailing newline at all', () => {
    expect(shown('a\nb', 'a\nb\nc')).toEqual(['1 a', '2 b', '+3 c'])
  })
})

describe('a change spread across a long file', () => {
  const long = (count: number): string =>
    Array.from({ length: count }, (_, i) => `line ${i}`).join('\n')

  it('reports two changed lines as two, however far apart they are', () => {
    // The gate used to be the sum of the two trimmed sides, so any two edits
    // more than ~750 lines apart made every line between them read as removed
    // and re-added. A 900-line file with two words changed reported +891 −891.
    const before = long(900)
    const after = before.replace('line 5\n', 'line 5 changed\n').replace('line 895\n', 'line 895 changed\n')

    expect(countChanges(diffLines(before, after))).toEqual({ added: 2, removed: 2 })
  })

  it('stays inside its budget on the file that gate was protecting', () => {
    const before = long(1900)
    const after = before.replace('line 10\n', 'changed\n').replace('line 1880\n', 'changed too\n')

    const started = performance.now()
    expect(countChanges(diffLines(before, after))).toEqual({ added: 2, removed: 2 })
    expect(performance.now() - started).toBeLessThan(400)
  })

  it('says so when it really does give up', () => {
    // A file rewritten end to end past the table's ceiling. The counts that
    // follow are every line of one side and then the other, which is not a
    // diff — so the output has to admit it rather than publish the numbers.
    const before = long(2500)
    const after = Array.from({ length: 2500 }, (_, i) => `other ${i}`).join('\n')

    expect(diffLines(before, after)[0]).toEqual({
      sign: '@',
      text: 'too large to match line by line — shown as a replacement',
    })
  })
})
