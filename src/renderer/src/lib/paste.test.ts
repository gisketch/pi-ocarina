import { describe, expect, it } from 'vitest'
import {
  applyPaste,
  FOLD_CHARS,
  FOLD_LINES,
  foldLabel,
  foldsIn,
  makeFold,
  shouldFold,
  spliceFolds,
} from './paste'

const lines = (count: number): string => Array.from({ length: count }, (_, i) => `line ${i}`).join('\n')

describe('when a paste folds', () => {
  it('leaves a short paste alone', () => {
    expect(shouldFold('one\ntwo\nthree')).toBe(false)
  })

  it('folds a stack trace', () => {
    expect(shouldFold(lines(FOLD_LINES))).toBe(true)
  })

  it('does not fold one line under the threshold', () => {
    expect(shouldFold(lines(FOLD_LINES - 1))).toBe(false)
  })

  it('folds one very long line', () => {
    // A minified blob has no newlines at all, so a line count alone would let
    // it flood the composer.
    expect(shouldFold('x'.repeat(FOLD_CHARS))).toBe(true)
    expect(shouldFold('x'.repeat(FOLD_CHARS - 1))).toBe(false)
  })
})

describe('what the token says', () => {
  it('counts lines when there are lines', () => {
    expect(foldLabel(lines(12))).toBe('pasted 12 lines')
  })

  it('counts characters for a single long line', () => {
    // "pasted 1 line" would say nothing about why the composer just folded it.
    expect(foldLabel('x'.repeat(900))).toBe('pasted 900 characters')
  })

  it('is readable text, not an invisible marker', () => {
    // Invisible would mean the caret walks through nothing and backspace does
    // something the reader cannot see.
    const fold = makeFold(1, lines(20))
    expect(fold.token).toBe('[pasted 20 lines #1]')
  })
})

describe('inserting a paste', () => {
  it('puts a small paste in as itself', () => {
    const result = applyPaste('a  b', { start: 2, end: 2 }, 'X', 1)

    expect(result.text).toBe('a X b')
    expect(result.caret).toBe(3)
    expect(result.fold).toBeNull()
  })

  it('replaces a big paste with its token and holds the text', () => {
    const big = lines(20)
    const result = applyPaste('see: ', { start: 5, end: 5 }, big, 1)

    expect(result.text).toBe('see: [pasted 20 lines #1]')
    expect(result.caret).toBe(result.text.length)
    expect(result.fold?.text).toBe(big)
  })

  it('replaces the selection rather than inserting beside it', () => {
    const result = applyPaste('keep DROP end', { start: 5, end: 9 }, 'X', 1)
    expect(result.text).toBe('keep X end')
  })
})

describe('sending', () => {
  it('puts the paste back exactly where the token stood', () => {
    // A paste dropped into the middle of a sentence belongs in the middle of
    // that sentence when the model reads it.
    const big = lines(20)
    const fold = makeFold(1, big)
    const text = `why does ${fold.token} happen?`

    expect(spliceFolds(text, [fold])).toBe(`why does ${big} happen?`)
  })

  it('restores several folds, whatever order they were made in', () => {
    const first = makeFold(1, lines(10))
    const second = makeFold(2, lines(30))
    const text = `${second.token} then ${first.token}`

    expect(spliceFolds(text, [first, second])).toBe(`${lines(30)} then ${lines(10)}`)
  })

  it('leaves text with no folds untouched', () => {
    expect(spliceFolds('plain', [])).toBe('plain')
  })

  it('restores a token the reader duplicated', () => {
    const fold = makeFold(1, 'BODY')
    expect(spliceFolds(`${fold.token} ${fold.token}`, [fold])).toBe('BODY BODY')
  })
})

describe('dropping a paste', () => {
  it('forgets a fold whose token was deleted', () => {
    // Deleting the chip is how a reader drops a paste, so the held text has to
    // follow the token rather than outlive it.
    const first = makeFold(1, 'A')
    const second = makeFold(2, 'B')

    expect(foldsIn(`only ${second.token}`, [first, second])).toEqual([second])
  })

  it('forgets everything when the composer is cleared', () => {
    expect(foldsIn('', [makeFold(1, 'A')])).toEqual([])
  })

  it('keeps a fold whose token is still there', () => {
    const fold = makeFold(1, 'A')
    expect(foldsIn(`x ${fold.token} y`, [fold])).toEqual([fold])
  })
})
