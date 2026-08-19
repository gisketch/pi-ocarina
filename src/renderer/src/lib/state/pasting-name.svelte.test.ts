import { describe, expect, it } from 'vitest'
import { nameAt } from './pasting.svelte'

/** `nameAt` writes staged file names into the text at the caret. It writes
 *  the names and nothing else: every space around a chip is one the reader
 *  typed — injected padding was reported as the composer editing their
 *  sentence. One space *between* two names, or two dropped at once would fuse
 *  into a single token in the sent text. */
describe('writing staged names into the text', () => {
  it('writes exactly the name at the caret', () => {
    expect(nameAt('see ', null, ['a.png'])).toEqual({ text: 'see a.png', caret: 9 })
  })

  it('adds nothing at the very start', () => {
    expect(nameAt('', null, ['a.png'])).toEqual({ text: 'a.png', caret: 5 })
  })

  it('separates two names with a single space', () => {
    expect(nameAt('', null, ['a.png', 'b.png']).text).toBe('a.png b.png')
  })

  it('does not pad against what follows', () => {
    // Caret at the end when there is no field; the text after is untouched.
    expect(nameAt('note: ', null, ['shot.png']).text).toBe('note: shot.png')
  })
})
