import { describe, expect, it } from 'vitest'
import { mergeLinks, parseInline, safeHref } from './markdown-inline'

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

  it('refuses a bare host that is not the host it reads as', () => {
    // `www.paypal.com@evil.test` resolves to evil.test, and a reader has no
    // way to see that from the text.
    expect(safeHref('www.paypal.com@evil.test')).toBeNull()
    expect(safeHref('www.example.com/a@b')).toBe('https://www.example.com/a@b')
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

describe('a link to a file on this machine', () => {
  it('reads a sandbox link as a file chip carrying the path', () => {
    expect(parseInline('[Download report.docx](sandbox:/Users/me/out/report.docx)')).toEqual([
      { text: 'Download report.docx', code: false, file: '/Users/me/out/report.docx' },
    ])
  })

  it('reads a file url the same way', () => {
    expect(parseInline('[log](file:///var/log/pi%20run.log)')).toEqual([
      { text: 'log', code: false, file: '/var/log/pi run.log' },
    ])
  })

  it('refuses a sandbox link that is not an absolute path', () => {
    expect(parseInline('[x](sandbox:relative/place)')).toEqual([
      { text: '[x](sandbox:relative/place)', code: false },
    ])
  })
})

describe('one chip per link', () => {
  it('folds a label the marks split back into one run', () => {
    const merged = mergeLinks(parseInline('[**bold** link](https://example.com)'))
    expect(merged).toEqual([
      { text: 'bold link', code: false, bold: true, href: 'https://example.com' },
    ])
  })

  it('keeps two different links apart', () => {
    const merged = mergeLinks(parseInline('[a](https://a.test)[b](https://b.test)'))
    expect(merged.map((part) => part.href)).toEqual(['https://a.test', 'https://b.test'])
  })

  it('leaves plain runs alone', () => {
    const parts = parseInline('just **words** here')
    expect(mergeLinks(parts)).toEqual(parts)
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


describe('untrusted input cannot stall the column', () => {
  // A message is re-parsed on every streamed token, so a line that takes half
  // a second to parse takes it once per token and freezes the thread.
  const under = (text: string, ms: number) => {
    const started = Date.now()
    parseInline(text)
    return Date.now() - started < ms
  }

  it('stays linear on a line of unclosed brackets', () => {
    expect(under('[a]('.repeat(80_000), 400)).toBe(true)
  })

  it('stays linear on a line of unclosed markers', () => {
    expect(under('*a '.repeat(80_000), 400)).toBe(true)
    expect(under('~~a '.repeat(80_000), 400)).toBe(true)
  })

  it('stays linear on a line that is all candidates', () => {
    expect(under('a **b** [c](https://x.test) `d` '.repeat(20_000), 400)).toBe(true)
  })

  it('stays linear when the needle exists but sits far away', () => {
    // The harder half: remembering only that something is *absent* leaves a
    // needle that exists at the end of the line to be rescanned from every
    // candidate before it, which is the same quadratic wearing a hat.
    expect(under(`${'['.repeat(320_000)}](x)`, 400)).toBe(true)
    expect(under(`${'[]('.repeat(120_000)}x)`, 400)).toBe(true)
  })
})

describe('a mention', () => {
  it('becomes a chip, so it looks the same sent as it did while typed', () => {
    expect(parseInline('why is @src/app.ts slow')).toEqual([
      { text: 'why is ', code: false },
      { text: '@src/app.ts', code: false, mention: true },
      { text: ' slow', code: false },
    ])
  })

  it('is a chip at the very start of a line', () => {
    expect(parseInline('@a.ts please')[0]).toMatchObject({ text: '@a.ts', mention: true })
  })

  it('leaves an email address alone', () => {
    // Without the shape rule, an email address and a mention of a person both
    // become chips claiming to be files.
    expect(parseInline('mail me@example.com now').every((one) => !one.mention)).toBe(true)
  })

  it('leaves a bare handle alone', () => {
    expect(parseInline('thanks @alice').every((one) => !one.mention)).toBe(true)
  })

  it('does not decorate inside code', () => {
    const segments = parseInline('`@src/a.ts`')
    expect(segments.every((one) => !one.mention)).toBe(true)
  })

  it('keeps every character of the line', () => {
    const text = 'see @a/b.ts and @c.ts, thanks'
    expect(parseInline(text).map((one) => one.text).join('')).toBe(text)
  })
})
