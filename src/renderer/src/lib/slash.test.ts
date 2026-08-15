import { describe, expect, it } from 'vitest'
import { filterSlash, resolveSlash, SLASH_COMMANDS, slashQuery } from './slash'

describe('slashQuery', () => {
  it('opens on a bare slash', () => {
    expect(slashQuery('/')).toBe('')
  })

  it('reads the word being typed', () => {
    expect(slashQuery('/com')).toBe('com')
  })

  it('stays closed for text that does not start with a slash', () => {
    expect(slashQuery('hello')).toBeNull()
  })

  it('does not open on a path in the middle of a sentence', () => {
    // Popping a command menu while someone writes `src/lib` would fight them.
    expect(slashQuery('look at src/lib')).toBeNull()
  })

  it('closes once a space is typed, because that is prose now', () => {
    expect(slashQuery('/compact the thread')).toBeNull()
    expect(slashQuery('/ ')).toBeNull()
  })

  it('closes on a newline too', () => {
    expect(slashQuery('/compact\nmore')).toBeNull()
  })
})

describe('filterSlash', () => {
  it('lists everything for an empty query', () => {
    expect(filterSlash('')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('narrows as the query grows', () => {
    expect(filterSlash('mod').map((c) => c.id)).toEqual(['model'])
  })

  it('returns nothing for a query that matches no command', () => {
    expect(filterSlash('zzz')).toEqual([])
  })
})

describe('resolveSlash', () => {
  it('recognises a command typed in full', () => {
    expect(resolveSlash('/compact')?.id).toBe('compact')
  })

  it('ignores surrounding whitespace', () => {
    expect(resolveSlash('  /model  ')?.id).toBe('model')
  })

  it('does not resolve a partial name', () => {
    // `/comp` is not `/compact`; sending it as text is honest, guessing is not.
    expect(resolveSlash('/comp')).toBeNull()
  })

  it('treats an unknown slash word as ordinary text', () => {
    expect(resolveSlash('/shrug')).toBeNull()
  })

  it('treats a message that merely contains a slash as ordinary text', () => {
    expect(resolveSlash('check src/lib/thread.ts')).toBeNull()
  })
})
