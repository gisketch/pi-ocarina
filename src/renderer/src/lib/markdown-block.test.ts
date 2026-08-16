import { describe, expect, it } from 'vitest'
import { STANDALONE } from './markdown-block'
import { parseMarkdown } from './markdown'

const kinds = (text: string) => parseMarkdown(text).map((node) => node.type)

describe('tables', () => {
  const TABLE = ['| Method | Endpoint |', '|---|---|', '| GET | /a |', '| POST | /b |'].join('\n')

  it('reads a header, a divider and its rows', () => {
    const [node] = parseMarkdown(TABLE)
    if (node.type !== 'table') throw new Error('not a table')

    expect(node.head.map((c) => c.segments[0].text)).toEqual(['Method', 'Endpoint'])
    expect(node.rows).toHaveLength(2)
    expect(node.rows[1].map((c) => c.segments[0].text)).toEqual(['POST', '/b'])
  })

  it('needs the divider, or a pipe in prose becomes a table', () => {
    expect(kinds('| not | a table |\njust words')).toEqual(['paragraph'])
  })

  it('reads inline markers inside a cell', () => {
    const [node] = parseMarkdown('| a | b |\n|---|---|\n| `code` | **bold** |')
    if (node.type !== 'table') throw new Error('not a table')

    expect(node.rows[0][0].segments[0].code).toBe(true)
    expect(node.rows[0][1].segments[0].bold).toBe(true)
  })

  it('ends where its rows end', () => {
    expect(kinds(`${TABLE}\n\nafter`)).toEqual(['table', 'paragraph'])
  })

  it('stays literal inside a fence', () => {
    expect(kinds('```\n| a |\n|---|\n```')).toEqual(['code'])
  })
})

describe('quotes', () => {
  it('gathers consecutive quoted lines into one', () => {
    const nodes = parseMarkdown('> one\n> two\n\nafter')
    expect(nodes.map((n) => n.type)).toEqual(['quote', 'paragraph'])
    expect(nodes[0].type === 'quote' && nodes[0].segments[0].text).toBe('one\ntwo')
  })

  it('needs the marker at the start of the line', () => {
    expect(kinds('a > b')).toEqual(['paragraph'])
  })
})

describe('images', () => {
  it('reads one alone on its line', () => {
    const [node] = parseMarkdown('![a shot](https://example.com/x.png)')
    expect(node).toEqual({ type: 'image', alt: 'a shot', src: 'https://example.com/x.png' })
  })

  it('allows an inline data image, which is how a screenshot arrives', () => {
    const [node] = parseMarkdown('![](data:image/png;base64,AAAA)')
    expect(node.type).toBe('image')
  })

  it('refuses a source it would not follow', () => {
    expect(kinds('![x](javascript:alert(1))')).toEqual(['paragraph'])
    expect(kinds('![x](file:///etc/passwd)')).toEqual(['paragraph'])
  })
})

describe('task lists', () => {
  it('reads the box and its state', () => {
    const [node] = parseMarkdown('- [x] done\n- [ ] not done\n- plain')
    if (node.type !== 'list') throw new Error('not a list')

    expect(node.items.map((i) => i.done)).toEqual([true, false, undefined])
    expect(node.items[0].segments[0].text).toBe('done')
  })
})

describe('the rule set is what makes a stop', () => {
  it('names the kinds that stand alone', () => {
    // A future screenshot or chart becomes its own stop by being named here,
    // and nothing else in the app has to change.
    expect([...STANDALONE].sort()).toEqual(['code', 'image', 'table'])
  })
})


describe('ordered lists keep the number the agent wrote', () => {
  it('starts where the agent started', () => {
    const [node] = parseMarkdown('10. ten\n11. eleven')
    if (node.type !== 'list') throw new Error('not a list')
    expect(node.start).toBe(10)
  })

  it('says nothing when it starts at one, which is the default', () => {
    const [node] = parseMarkdown('1. one\n2. two')
    if (node.type !== 'list') throw new Error('not a list')
    expect(node.start).toBeUndefined()
  })

  it('leaves a bullet list alone', () => {
    const [node] = parseMarkdown('- a\n- b')
    if (node.type !== 'list') throw new Error('not a list')
    expect(node.start).toBeUndefined()
  })
})
