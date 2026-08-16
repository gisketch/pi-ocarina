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


describe('headings', () => {
  it('reads one to three hashes', () => {
    const nodes = parseMarkdown('# One\n## Two\n### Three')
    expect(nodes.map((n) => (n.type === 'heading' ? n.level : n.type))).toEqual([1, 2, 3])
  })

  it('clamps deeper hashes to three', () => {
    // Three treatments exist. A fourth level falling through to body text
    // would read as a paragraph the agent meant as a heading.
    const [node] = parseMarkdown('##### Deep')
    expect(node).toEqual({ type: 'heading', level: 3, segments: [{ text: 'Deep', code: false }] })
  })

  it('needs a space, so a comment or a tag stays text', () => {
    expect(parseMarkdown('#hashtag').map((n) => n.type)).toEqual(['paragraph'])
  })

  it('closes the paragraph above it', () => {
    expect(parseMarkdown('words\n## Head').map((n) => n.type)).toEqual(['paragraph', 'heading'])
  })

  it('reads inline markers inside itself', () => {
    const [node] = parseMarkdown('## the `sync` worker')
    if (node.type !== 'heading') throw new Error('not a heading')
    expect(node.segments.map((s) => s.code)).toEqual([false, true, false])
  })
})

describe('thematic breaks', () => {
  it('reads three or more of any marker', () => {
    expect(parseMarkdown('---\n***\n___').map((n) => n.type)).toEqual(['rule', 'rule', 'rule'])
  })

  it('wins over the bullet rule, which would also claim it', () => {
    expect(parseMarkdown('- a\n---').map((n) => n.type)).toEqual(['list', 'rule'])
  })

  it('stays literal inside a fence', () => {
    const [node] = parseMarkdown('```\n---\n```')
    expect(node).toEqual({ type: 'code', lang: '', text: '---' })
  })

  it('leaves two markers alone', () => {
    expect(parseMarkdown('--').map((n) => n.type)).toEqual(['paragraph'])
  })
})

describe('bold', () => {
  it('reads a double star', () => {
    expect(parseInline('go to **Admin**')).toEqual([
      { text: 'go to ', code: false },
      { text: 'Admin', code: false, bold: true },
    ])
  })

  it('keeps code inside bold, because the two nest', () => {
    expect(parseInline('**run `sync` now**')).toEqual([
      { text: 'run ', code: false, bold: true },
      { text: 'sync', code: true, bold: true },
      { text: ' now', code: false, bold: true },
    ])
  })

  it('leaves a star inside code alone, where it is a glob', () => {
    expect(parseInline('`src/**/*.ts`')).toEqual([{ text: 'src/**/*.ts', code: true }])
  })

  it('leaves a single star alone', () => {
    expect(parseInline('2 * 3')).toEqual([{ text: '2 * 3', code: false }])
  })

  it('leaves an operator alone, because nothing closes it', () => {
    // `x ** y` is exponentiation in half the languages an agent writes about.
    // Reading the opener as emphasis bolded the rest of the sentence and ate
    // the two characters it was written with.
    expect(parseInline('x ** y')).toEqual([{ text: 'x ** y', code: false }])
    expect(parseInline('a **b')).toEqual([{ text: 'a **b', code: false }])
  })

  it('does not count a closer that is inside code', () => {
    expect(parseInline('a **b `c**d`')).toEqual([
      { text: 'a **b ', code: false },
      { text: 'c**d', code: true },
    ])
  })
})

describe('list nesting', () => {
  it('keeps counting when a nested bullet interrupts', () => {
    // The bug from the screenshot: the nested bullets closed the ordered list,
    // so `Save` opened a new one and the numbering restarted at 1.
    const [node] = parseMarkdown(
      '1. Go to Admin\n2. Click Add\n3. Fill fields:\n   - Name\n   - Unit\n4. Save',
    )
    if (node.type !== 'list') throw new Error('not a list')

    expect(node.ordered).toBe(true)
    expect(node.items).toHaveLength(4)
    expect(node.items[2].children?.map((c) => c.segments[0].text)).toEqual(['Name', 'Unit'])
    expect(node.items[2].childrenOrdered).toBe(false)
    expect(node.items[3].segments[0].text).toBe('Save')
  })

  it('does not nest a deeper indent a second time', () => {
    const [node] = parseMarkdown('- a\n  - b\n    - c')
    if (node.type !== 'list') throw new Error('not a list')

    expect(node.items).toHaveLength(1)
    expect(node.items[0].children?.map((c) => c.segments[0].text)).toEqual(['b', 'c'])
  })

  it('still starts a new list when the kind changes at the same level', () => {
    expect(parseMarkdown('- a\n1. b').map((n) => n.type)).toEqual(['list', 'list'])
  })

  it('does not nest under nothing', () => {
    const [node] = parseMarkdown('   - orphan')
    if (node.type !== 'list') throw new Error('not a list')
    expect(node.items[0].children).toBeUndefined()
  })
})
