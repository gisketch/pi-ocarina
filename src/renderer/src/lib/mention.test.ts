import { describe, expect, it } from 'vitest'
import { applyMention, mentionAt, mentionedPaths } from './mention'

describe('mentionAt', () => {
  it('opens on an @ at the start of a message', () => {
    expect(mentionAt('@src', 4)).toEqual({ start: 0, end: 4, query: 'src' })
  })

  it('opens on an @ after a space', () => {
    expect(mentionAt('look at @src', 12)?.query).toBe('src')
  })

  it('opens on a bare @, before anything is typed', () => {
    expect(mentionAt('@', 1)?.query).toBe('')
  })

  it('does not open inside an email address', () => {
    // Otherwise writing to someone would pop a file picker.
    expect(mentionAt('mail me@example.com', 19)).toBeNull()
  })

  it('closes once a space is typed, because a path has no spaces', () => {
    expect(mentionAt('@src/lib and then', 17)).toBeNull()
  })

  it('reads the mention the caret is inside, not the last one in the text', () => {
    const text = '@first @second'
    expect(mentionAt(text, 6)?.query).toBe('first')
  })

  it('finds nothing when there is no @ before the caret', () => {
    expect(mentionAt('plain text', 10)).toBeNull()
  })
})

describe('applyMention', () => {
  it('replaces the typed fragment with the chosen path', () => {
    const mention = mentionAt('@src', 4)!
    expect(applyMention('@src', mention, 'src/lib/thread.ts').text).toBe('@src/lib/thread.ts ')
  })

  it('leaves the rest of the message alone', () => {
    const text = 'look at @thr and tell me'
    const mention = mentionAt(text.slice(0, 12), 12)!
    const next = applyMention(text, mention, 'src/thread.ts')

    expect(next.text).toBe('look at @src/thread.ts  and tell me')
  })

  it('puts the caret after the inserted path', () => {
    const mention = mentionAt('@s', 2)!
    const next = applyMention('@s', mention, 'a/b.ts')

    expect(next.caret).toBe(next.text.length)
  })

  it('adds a trailing space so the picker does not reopen on what it inserted', () => {
    const mention = mentionAt('@s', 2)!
    expect(applyMention('@s', mention, 'a.ts').text.endsWith(' ')).toBe(true)
  })
})

describe('mentionedPaths', () => {
  it('collects every path a message names', () => {
    expect(mentionedPaths('compare @a.ts with @b/c.ts')).toEqual(['a.ts', 'b/c.ts'])
  })

  it('does not repeat a path mentioned twice', () => {
    expect(mentionedPaths('@a.ts and again @a.ts')).toEqual(['a.ts'])
  })

  it('ignores an @ inside a word', () => {
    expect(mentionedPaths('mail me@example.com')).toEqual([])
  })

  it('finds nothing in a message with no mentions', () => {
    expect(mentionedPaths('just prose')).toEqual([])
  })
})
