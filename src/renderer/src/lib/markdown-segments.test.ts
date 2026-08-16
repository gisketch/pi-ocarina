import { describe, expect, it } from 'vitest'
import { segmentText, segmentsOf } from './markdown-segments'
import { parseMarkdown } from './markdown'

const segments = (text: string) => segmentsOf(parseMarkdown(text))

describe('where a message breaks', () => {
  it('makes text, code and text three stops', () => {
    const parts = segments('before\n\n```\nx\n```\n\nafter')
    expect(parts.map((p) => p.map((n) => n.type))).toEqual([['paragraph'], ['code'], ['paragraph']])
  })

  it('leaves a message with no code as one stop', () => {
    expect(segments('## Head\n\nwords\n\n- a')).toHaveLength(1)
  })

  it('groups every consecutive non-code node together', () => {
    const parts = segments('# H\n\ntext\n\n---\n\n- a\n\n```\nx\n```')
    expect(parts).toHaveLength(2)
    expect(parts[0].map((n) => n.type)).toEqual(['heading', 'paragraph', 'rule', 'list'])
  })

  it('keeps two fences apart', () => {
    const parts = segments('```\na\n```\n\n```\nb\n```')
    expect(parts.map((p) => p.map((n) => n.type))).toEqual([['code'], ['code']])
  })

  it('has nothing to break in an empty message', () => {
    expect(segments('')).toEqual([])
  })
})

describe('what a segment copies', () => {
  it('gives back the code, not the fence', () => {
    const [code] = segments('```ts\nconst x = 1\n```')
    expect(segmentText(code)).toBe('const x = 1')
  })

  it('keeps a list\'s nested items, which the reader can see', () => {
    const [prose] = segments('1. top\n   - child\n2. two\n\n```\nx\n```')
    expect(segmentText(prose)).toBe('top\nchild\ntwo')
  })

  it('writes a thematic break back as the characters it was', () => {
    const [prose] = segments('a\n\n---\n\nb\n\n```\nx\n```')
    expect(segmentText(prose)).toBe('a\n---\nb')
  })
})
