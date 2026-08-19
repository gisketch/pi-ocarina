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
      // The space stays plain: it is the reader's, not the chip's. The `@` is
      // the one cell the mark stands on — the same one cell everywhere, which
      // is what keeps every mark the same size.
      { kind: 'plain', text: 'why is ' },
      { kind: 'mention', text: '@src/app.ts', lead: 1 },
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

describe('a chip is exactly its token', () => {
  it('a file chip is the name — the space in front stays the reader’s text', () => {
    // The reported bug: a chip that absorbed the space before it read as the
    // composer deleting the reader's space. Chips are elements with icons of
    // their own now; they claim no cell from the text.
    expect(segment('pasted-1.png ok', [], ['pasted-1.png'])[0]).toEqual({
      kind: 'file',
      text: 'pasted-1.png',
      lead: 0,
    })
    expect(segment('see pasted-1.png', [], ['pasted-1.png'])).toEqual([
      { kind: 'plain', text: 'see ' },
      { kind: 'file', text: 'pasted-1.png', lead: 0 },
    ])
  })

  it('a skill chip is slash and name; the space before it stays the reader’s', () => {
    expect(segment('do /humanizer', [], [], ['humanizer'])).toEqual([
      { kind: 'plain', text: 'do ' },
      { kind: 'skill', text: '/humanizer', lead: 1 },
    ])
  })
})

describe('the standard insert flow, end to end', () => {
  it('a skill chip then a pasted file, apart by exactly the typed space', () => {
    // What `applySlash` and `nameAt` now produce: exactly the name and exactly
    // the file names — every space in the text is one the reader typed.
    const text = '/skill-creator pasted-1.png'
    const parts = segment(text, [], ['pasted-1.png'], ['skill-creator'])

    expect(parts[0]).toEqual({ kind: 'skill', text: '/skill-creator', lead: 1 })
    expect(parts[1]).toEqual({ kind: 'plain', text: ' ' })
    expect(parts[2]).toEqual({ kind: 'file', text: 'pasted-1.png', lead: 0 })
  })
})
