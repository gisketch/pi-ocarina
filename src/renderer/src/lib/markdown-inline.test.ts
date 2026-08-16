import { describe, expect, it } from 'vitest'
import { parseInline, safeHref } from './markdown-inline'

describe('what a link may be', () => {
  it('follows only the schemes a reader could have meant', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com')
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c')
  })

  it('refuses everything else, whatever the agent wrote', () => {
    // `openExternal` launches whatever the OS associates with a scheme, so
    // this list is the only thing between a message and the shell.
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>',
      'vbscript:x',
      ' javascript:alert(1)',
      'JavaScript:alert(1)',
    ]) {
      expect(safeHref(url)).toBeNull()
    }
  })

  it('completes a bare www, which is how agents usually write one', () => {
    expect(safeHref('www.example.com')).toBe('https://www.example.com')
  })
})

describe('links', () => {
  it('reads a labelled link', () => {
    expect(parseInline('see [the docs](https://example.com) now')).toEqual([
      { text: 'see ', code: false },
      { text: 'the docs', code: false, href: 'https://example.com' },
      { text: ' now', code: false },
    ])
  })

  it('keeps a mark inside the label', () => {
    const [part] = parseInline('[**bold** link](https://example.com)')
    expect(part).toEqual({ text: 'bold', code: false, bold: true, href: 'https://example.com' })
  })

  it('leaves an unsafe link as the text the agent wrote', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([
      { text: '[click](javascript:alert(1))', code: false },
    ])
  })

  it('links a bare url in prose', () => {
    const parts = parseInline('go to https://example.com/x today')
    expect(parts[1]).toEqual({
      text: 'https://example.com/x',
      code: false,
      href: 'https://example.com/x',
    })
  })

  it('leaves a url inside code alone', () => {
    expect(parseInline('`https://example.com`')).toEqual([
      { text: 'https://example.com', code: true },
    ])
  })
})

describe('marks', () => {
  it('reads bold, italic and strikethrough', () => {
    expect(parseInline('**b**')).toEqual([{ text: 'b', code: false, bold: true }])
    expect(parseInline('*i*')).toEqual([{ text: 'i', code: false, italic: true }])
    expect(parseInline('~~s~~')).toEqual([{ text: 's', code: false, strike: true }])
  })

  it('reads bold before italic, or one becomes two of the other', () => {
    expect(parseInline('**b**')[0].italic).toBeUndefined()
  })

  it('composes marks rather than nesting them', () => {
    expect(parseInline('**bold *and italic* **')).toContainEqual({
      text: 'and italic',
      code: false,
      bold: true,
      italic: true,
    })
  })

  it('leaves an operator alone, because nothing closes it', () => {
    expect(parseInline('x ** y')).toEqual([{ text: 'x ** y', code: false }])
    expect(parseInline('2 * 3')).toEqual([{ text: '2 * 3', code: false }])
    expect(parseInline('a ~~ b')).toEqual([{ text: 'a ~~ b', code: false }])
  })

  it('leaves an underscore alone entirely, because names use it', () => {
    expect(parseInline('call snake_case_name here')).toEqual([
      { text: 'call snake_case_name here', code: false },
    ])
  })

  it('never loses a word, whatever markers are dangling', () => {
    // Markers may be dropped; the words they wrapped may not.
    const cases: [string, string][] = [
      ['**a', '**a'],
      ['*a', '*a'],
      ['~~a', '~~a'],
      ['[a](', '[a]('],
      ['[a](javascript:x)', '[a](javascript:x)'],
      ['**a `b` c**', 'a b c'],
      ['x**y**z', 'xyz'],
    ]
    for (const [input, expected] of cases) {
      expect(parseInline(input).map((part) => part.text).join('')).toBe(expected)
    }
  })
})
