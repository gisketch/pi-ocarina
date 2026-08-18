import { describe, expect, it } from 'vitest'
import { segment } from './composer-segments'
import { makeFold, type Fold } from './paste'

/** The property the mirror's alignment rests on: every character of the input
 *  appears exactly once, in order. Anything else and the caret drifts. */
const rejoin = (text: string, folds: Fold[] = []): string =>
  segment(text, folds)
    .map((one) => one.text)
    .join('')

describe('segmenting', () => {
  it('leaves plain text as one run', () => {
    expect(segment('hello there')).toEqual([{ kind: 'plain', text: 'hello there' }])
  })

  it('finds a mention', () => {
    expect(segment('why is @src/app.ts slow')).toEqual([
      { kind: 'plain', text: 'why is' },
      // The space travels with the chip: it is the cell the mark stands on,
      // and the `@` after it becomes the gap before the name.
      { kind: 'mention', text: ' @src/app.ts', lead: 2 },
      { kind: 'plain', text: ' slow' },
    ])
  })

  it('finds a mention at the very start', () => {
    expect(segment('@a.ts please')[0]).toEqual({ kind: 'mention', text: '@a.ts', lead: 1 })
  })

  it('leaves an email address alone', () => {
    // The same rule the picker uses, so what it inserts is what this decorates.
    expect(segment('mail me@example.com')).toEqual([{ kind: 'plain', text: 'mail me@example.com' }])
  })

  it('finds several mentions', () => {
    const kinds = segment('@a.ts and @b.ts').map((one) => one.kind)
    expect(kinds).toEqual(['mention', 'plain', 'mention'])
  })

  it('finds a fold token', () => {
    const fold = makeFold(1, 'x'.repeat(500))
    expect(segment(`why does ${fold.token} happen`, [fold])).toEqual([
      { kind: 'plain', text: 'why does ' },
      { kind: 'fold', text: fold.token, lead: 1 },
      { kind: 'plain', text: ' happen' },
    ])
  })

  it('finds a mention and a fold in one message', () => {
    const fold = makeFold(1, 'x'.repeat(500))
    const kinds = segment(`@a.ts ${fold.token}`, [fold]).map((one) => one.kind)

    expect(kinds).toEqual(['mention', 'plain', 'fold'])
  })

  it('marks both copies of a token the reader duplicated', () => {
    const fold = makeFold(1, 'BODY')
    const kinds = segment(`${fold.token} ${fold.token}`, [fold]).map((one) => one.kind)

    expect(kinds).toEqual(['fold', 'plain', 'fold'])
  })

  it('ignores a fold whose token is no longer there', () => {
    const fold = makeFold(1, 'BODY')
    expect(segment('nothing here', [fold])).toEqual([{ kind: 'plain', text: 'nothing here' }])
  })

  it('handles an empty composer', () => {
    expect(segment('')).toEqual([])
  })
})

describe('what the caret depends on', () => {
  it('reproduces the text exactly, whatever is in it', () => {
    const fold = makeFold(1, 'x'.repeat(500))
    const cases = [
      '',
      'plain',
      '@a.ts',
      '  @a.ts  ',
      `@a.ts ${fold.token} tail`,
      'me@example.com and @real.ts',
      'line one\nline two @a.ts\n',
    ]

    for (const text of cases) {
      expect(rejoin(text, [fold])).toBe(text)
    }
  })

  it('never emits an empty run, which would mean a lost boundary', () => {
    const fold = makeFold(1, 'BODY')
    for (const one of segment(`@a.ts${fold.token}`, [fold])) {
      expect(one.text).not.toBe('')
    }
  })

  it('keeps newlines in the plain runs, so lines still line up', () => {
    expect(rejoin('a\n\nb')).toBe('a\n\nb')
  })
})

describe('what a chip may sacrifice to its mark', () => {
  it('never a letter of a file name — only the space in front, when there is one', () => {
    // The reported bug: a staged file at position 0 has no space, the default
    // lead hid its first letter, and `pasted-1.png` read `asted-1.png`.
    expect(segment('pasted-1.png ok', [], ['pasted-1.png'])[0]).toEqual({
      kind: 'file',
      text: 'pasted-1.png',
      lead: 0,
    })
    expect(segment('see pasted-1.png', [], ['pasted-1.png'])[1]).toEqual({
      kind: 'file',
      text: ' pasted-1.png',
      lead: 1,
    })
  })

  it('a skill gives its space and its slash, which is what earns the full-size mark', () => {
    expect(segment('do /humanizer', [], [], ['humanizer'])[1]).toEqual({
      kind: 'skill',
      text: ' /humanizer',
      lead: 2,
    })
  })
})
