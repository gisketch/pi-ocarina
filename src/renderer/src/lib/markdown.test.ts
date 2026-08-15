import { describe, expect, it } from 'vitest'
import { lastCodeBlock, parseInline, parseMarkdown } from './markdown'
import { newestCodeBlock } from './thread'
import type { Block } from './thread'

const text = (node: ReturnType<typeof parseMarkdown>[number]): string =>
  node.type === 'code' ? node.text : ''

describe('parseInline', () => {
  it('splits backticks into code and plain runs', () => {
    expect(parseInline('call `runSync()` first')).toEqual([
      { text: 'call ', code: false },
      { text: 'runSync()', code: true },
      { text: ' first', code: false },
    ])
  })

  it('leaves text without backticks alone', () => {
    expect(parseInline('plain words')).toEqual([{ text: 'plain words', code: false }])
  })

  it('keeps a dangling backtick’s text rather than eating it', () => {
    expect(parseInline('open `unclosed')).toEqual([
      { text: 'open ', code: false },
      { text: 'unclosed', code: true },
    ])
  })

  it('drops nothing but empty runs', () => {
    expect(parseInline('``a``')).toEqual([{ text: 'a', code: false }])
  })
})

describe('parseMarkdown', () => {
  it('reads a plain sentence as one paragraph', () => {
    const nodes = parseMarkdown('just a line')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('paragraph')
  })

  it('splits paragraphs on a blank line', () => {
    expect(parseMarkdown('first\n\nsecond').map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
    ])
  })

  it('keeps a wrapped paragraph together', () => {
    const nodes = parseMarkdown('one\ntwo')
    expect(nodes).toHaveLength(1)
  })

  it('reads a bullet list', () => {
    const [node] = parseMarkdown('- alpha\n- beta')
    expect(node).toMatchObject({ type: 'list', ordered: false })
    expect(node.type === 'list' && node.items).toHaveLength(2)
  })

  it('reads a numbered list', () => {
    const [node] = parseMarkdown('1. first\n2. second')
    expect(node).toMatchObject({ type: 'list', ordered: true })
  })

  it('does not merge a bullet list into a numbered one', () => {
    expect(parseMarkdown('- a\n1. b').map((node) => node.type)).toEqual(['list', 'list'])
  })

  it('ends a list when prose resumes', () => {
    expect(parseMarkdown('- a\nnot a bullet').map((node) => node.type)).toEqual([
      'list',
      'paragraph',
    ])
  })

  it('reads a fenced block with its language', () => {
    const [node] = parseMarkdown('```ts\nconst x = 1\n```')
    expect(node).toMatchObject({ type: 'code', lang: 'ts', text: 'const x = 1' })
  })

  it('reads a fenced block with no language', () => {
    const [node] = parseMarkdown('```\nplain\n```')
    expect(node).toMatchObject({ type: 'code', lang: '', text: 'plain' })
  })

  it('does not treat a fence’s contents as markdown', () => {
    const [node] = parseMarkdown('```\n- not a bullet\n`not code`\n```')
    expect(text(node)).toBe('- not a bullet\n`not code`')
  })

  it('opens a block for a fence that has not closed yet', () => {
    // The agent is still typing. Its half-written block belongs in a block.
    const [node] = parseMarkdown('```ts\nconst partial =')
    expect(node).toMatchObject({ type: 'code', text: 'const partial =' })
  })

  it('keeps prose either side of a fence', () => {
    expect(parseMarkdown('before\n```\nx\n```\nafter').map((node) => node.type)).toEqual([
      'paragraph',
      'code',
      'paragraph',
    ])
  })

  it('reads an empty fence as an empty block, not as nothing', () => {
    expect(parseMarkdown('```\n```')).toEqual([{ type: 'code', lang: '', text: '' }])
  })

  it('loses no text from a mixed message', () => {
    const source = 'Fixed it:\n\n- one\n- two\n\n```sh\npnpm test\n```\n\nAll green.'
    const nodes = parseMarkdown(source)

    expect(nodes.map((node) => node.type)).toEqual(['paragraph', 'list', 'code', 'paragraph'])
  })
})

describe('lastCodeBlock', () => {
  it('returns the newest block when there are several', () => {
    expect(lastCodeBlock('```\nfirst\n```\ntext\n```\nsecond\n```')).toBe('second')
  })

  it('returns null when there is no code', () => {
    expect(lastCodeBlock('no code here')).toBeNull()
  })
})

describe('newestCodeBlock', () => {
  const agent = (id: string, body: string): Block => ({ kind: 'agent', id, text: body })

  it('searches a thread newest-first', () => {
    const blocks: Block[] = [agent('a1', '```\nold\n```'), agent('a2', '```\nnew\n```')]

    expect(newestCodeBlock(blocks)).toBe('new')
  })

  it('skips messages that carry no code', () => {
    const blocks: Block[] = [agent('a1', '```\nfound\n```'), agent('a2', 'just prose')]

    expect(newestCodeBlock(blocks)).toBe('found')
  })

  it('reads a code block the user pasted too', () => {
    expect(newestCodeBlock([{ kind: 'user', id: 'u1', text: '```\nmine\n```' }])).toBe('mine')
  })

  it('ignores ledger and card blocks', () => {
    const blocks: Block[] = [
      agent('a1', '```\ncode\n```'),
      { kind: 'ledger', id: 'l1', rows: [] },
      { kind: 'approve', id: 'p1', command: 'rm -rf /' },
    ]

    expect(newestCodeBlock(blocks)).toBe('code')
  })

  it('returns null for a thread with no code at all', () => {
    expect(newestCodeBlock([agent('a1', 'nothing to copy')])).toBeNull()
  })
})
