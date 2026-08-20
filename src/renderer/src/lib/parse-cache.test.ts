import { describe, expect, it } from 'vitest'
import {
  parseInlineCached,
  parseMarkdownCached,
  segmentTextCached,
  segmentsOfCached,
} from './parse-cache'
import { parseMarkdown } from './markdown'
import { segmentText, segmentsOf } from './markdown-segments'

describe('the remembered parse', () => {
  it('answers the same text with the same nodes', () => {
    const text = 'a paragraph\n\n```ts\nconst a = 1\n```\n\nanother'
    const first = parseMarkdownCached(text)
    // Identity, not equality: the nav model and the renderer parse the same
    // message, and only a shared array lets the downstream caches land.
    expect(parseMarkdownCached(text)).toBe(first)
    expect(first).toEqual(parseMarkdown(text))
  })

  it('carries identity through segments and their source', () => {
    const nodes = parseMarkdownCached('prose\n\n```js\nx\n```')
    const segments = segmentsOfCached(nodes)
    expect(segmentsOfCached(nodes)).toBe(segments)
    expect(segments).toEqual(segmentsOf(nodes))

    const source = segmentTextCached(segments[0])
    expect(segmentTextCached(segments[0])).toBe(source)
    expect(source).toBe(segmentText(segments[0]))
  })

  it('remembers inline prose the same way', () => {
    const first = parseInlineCached('some **bold** and `code`')
    expect(parseInlineCached('some **bold** and `code`')).toBe(first)
  })

  it('tells two texts apart', () => {
    expect(parseMarkdownCached('one')).not.toBe(parseMarkdownCached('two'))
    expect(parseMarkdownCached('one')).toEqual(parseMarkdown('one'))
  })
})
