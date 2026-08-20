import { describe, expect, it } from 'vitest'
import { highlightBlockCached } from './highlight-cache'
import { highlightBlock } from './highlight'

describe('the incremental fence', () => {
  it('answers exactly what the full walk answers', () => {
    const text = 'const a = "one"\n/* opens\nstill a comment\n*/ const b = 2'
    expect(highlightBlockCached(text, 'ts')).toEqual(highlightBlock(text, 'ts'))
  })

  it('keeps identity for unchanged text', () => {
    const text = 'let x = 1\nlet y = 2'
    const first = highlightBlockCached(text, 'ts')
    expect(highlightBlockCached(text, 'ts')).toBe(first)
  })

  it('stays correct while a block streams, line by line', () => {
    // The exact shape of a streaming fence: each batch extends the text —
    // sometimes mid-line — and the cached answer must match a from-scratch
    // walk every time, including when a batch opens a block comment that
    // recolours everything the next batch adds.
    let text = ''
    const batches = ['const a', ' = "s"\nlet b = 1\n', '/* open\n', 'inside\n', '*/ done()']
    for (const batch of batches) {
      text += batch
      expect(highlightBlockCached(text, 'ts')).toEqual(highlightBlock(text, 'ts'))
    }
  })

  it('recovers when an earlier line is rewritten', () => {
    const grown = 'aaa\nbbb\nccc'
    highlightBlockCached(grown, 'ts')
    const edited = 'aaa\nBBB\nccc'
    expect(highlightBlockCached(edited, 'ts')).toEqual(highlightBlock(edited, 'ts'))
  })

  it('keeps two languages of the same text apart', () => {
    const text = '# not a comment in every language'
    expect(highlightBlockCached(text, 'python')).toEqual(highlightBlock(text, 'python'))
    expect(highlightBlockCached(text, 'ts')).toEqual(highlightBlock(text, 'ts'))
  })
})
