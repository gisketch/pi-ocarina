import { describe, expect, it } from 'vitest'
import { bodyKind, extractArticle } from './extract'
import { decodeEntities, tokenize } from './html-text'
import { MAX_DEPTH, parse, pickContent, textLength } from './html-tree'

describe('tokenize', () => {
  it('reads a tag, its attributes and its text', () => {
    expect(tokenize('<a href="/x" class=big>hi</a>')).toEqual([
      { type: 'open', name: 'a', attrs: { href: '/x', class: 'big' }, selfClosing: false },
      { type: 'text', text: 'hi' },
      { type: 'close', name: 'a' },
    ])
  })

  it('treats a void element as closed however it was written', () => {
    const [br, img] = tokenize('<br><img src="a.png" />')
    expect(br).toMatchObject({ type: 'open', name: 'br', selfClosing: true })
    expect(img).toMatchObject({ type: 'open', name: 'img', selfClosing: true })
  })

  it('does not read markup inside a script', () => {
    // A `<` in JavaScript is a less-than sign. Reading it as a tag turns the
    // rest of the document into soup.
    const tokens = tokenize('<script>if (a<b) {}</script><p>after</p>')
    expect(tokens.filter((token) => token.type === 'open').map((token) => token.name)).toEqual([
      'script',
      'p',
    ])
  })

  it('takes a stray less-than sign as text', () => {
    expect(tokenize('a < b')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: '<' },
      { type: 'text', text: ' b' },
    ])
  })

  it('drops comments and doctypes', () => {
    expect(tokenize('<!doctype html><!-- note --><p>x</p>').map((token) => token.type)).toEqual([
      'open',
      'text',
      'close',
    ])
  })

  it('survives an unterminated tag', () => {
    expect(() => tokenize('<p class="x')).not.toThrow()
  })
})

describe('decodeEntities', () => {
  it('reads named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &#8212; c &#x2014; d')).toBe('a & b — c — d')
  })

  it('leaves a bare ampersand alone', () => {
    // Without the semicolon rule, `AT&T` loses its ampersand — and prose is
    // more common on a page than a malformed entity.
    expect(decodeEntities('AT&T and R&D')).toBe('AT&T and R&D')
  })

  it('leaves an out-of-range code point as written', () => {
    expect(decodeEntities('&#9999999999;')).toBe('&#9999999999;')
  })
})

describe('pickContent', () => {
  it('prefers the article over the whole body', () => {
    const html = `<body><nav>one two three</nav><article>${'word '.repeat(80)}</article></body>`
    const picked = pickContent(parse(html))
    expect(picked.name).toBe('article')
  })

  it('falls back to the body when the article is a stub', () => {
    // A template that marks an empty `<article>` must not win over the page.
    const html = `<body><article>x</article><div>${'word '.repeat(200)}</div></body>`
    expect(pickContent(parse(html)).name).toBe('body')
  })

  it('falls back to the body when nothing is marked', () => {
    expect(pickContent(parse('<body><div>hello</div></body>')).name).toBe('body')
  })

  it('drops chrome subtrees entirely', () => {
    const tree = parse('<body><nav><a href="/">menu</a></nav><p>real</p></body>')
    expect(textLength(tree)).toBe('real'.length)
  })
})

describe('extractArticle', () => {
  it('keeps the prose and headings and none of the navigation', () => {
    const html = `
      <html><head><title>Docs</title></head>
      <body>
        <nav><a href="/a">Home</a><a href="/b">API</a></nav>
        <article>
          <h1>Connection pooling</h1>
          <p>The pool reuses <code>open</code> connections.</p>
          <ul><li>fewer handshakes</li><li>bounded sockets</li></ul>
        </article>
        <footer>© 2026</footer>
      </body></html>`

    const { title, markdown } = extractArticle(html)

    expect(title).toBe('Docs')
    expect(markdown).toBe(
      '# Connection pooling\n\nThe pool reuses `open` connections.\n\n- fewer handshakes\n- bounded sockets',
    )
    expect(markdown).not.toContain('Home')
    expect(markdown).not.toContain('2026')
  })

  it('adds the document title when the content has no heading', () => {
    const { markdown } = extractArticle('<title>Only</title><body><p>text</p></body>')
    expect(markdown).toBe('# Only\n\ntext')
  })

  it('keeps a link and its target', () => {
    const { markdown } = extractArticle('<body><p>See <a href="/g">the guide</a>.</p></body>')
    expect(markdown).toBe('See [the guide](/g).')
  })

  it('turns a script link into plain text', () => {
    // `javascript:` in the model's context offers it something it must never
    // be asked to run.
    const { markdown } = extractArticle('<body><p><a href="javascript:go()">click</a></p></body>')
    expect(markdown).toBe('click')
  })

  it('keeps the whitespace inside a code block', () => {
    const { markdown } = extractArticle('<body><pre>one\n  two</pre></body>')
    expect(markdown).toBe('```\none\n  two\n```')
  })

  it('nests a sublist under its item', () => {
    const html = '<body><ul><li>a<ul><li>b</li></ul></li><li>c</li></ul></body>'
    expect(extractArticle(html).markdown).toBe('- a\n  - b\n- c')
  })

  it('numbers an ordered list', () => {
    expect(extractArticle('<body><ol><li>a</li><li>b</li></ol></body>').markdown).toBe('1. a\n2. b')
  })

  it('reads a list whose items were never closed', () => {
    expect(extractArticle('<body><ul><li>a<li>b</ul></body>').markdown).toBe('- a\n- b')
  })

  it('writes a table as rows', () => {
    const html = '<body><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table></body>'
    expect(extractArticle(html).markdown).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('quotes a blockquote', () => {
    expect(extractArticle('<body><blockquote><p>said</p></blockquote></body>').markdown).toBe(
      '> said',
    )
  })

  it('keeps loose prose that no paragraph wrapped', () => {
    expect(extractArticle('<body><div>bare sentence</div></body>').markdown).toBe('bare sentence')
  })

  it('gives an image its alt text and nothing else', () => {
    const { markdown } = extractArticle('<body><p><img src="/big.png" alt="the chart"></p></body>')
    expect(markdown).toBe('![the chart]')
  })

  it('returns nothing rather than failing on a page with no text', () => {
    expect(extractArticle('<body><nav>menu</nav></body>').markdown).toBe('')
  })
})

describe('bodyKind', () => {
  it('converts html, passes text and json through, and refuses binary', () => {
    expect(bodyKind('text/html; charset=utf-8')).toBe('html')
    expect(bodyKind('application/json')).toBe('text')
    expect(bodyKind('application/vnd.api+json')).toBe('text')
    expect(bodyKind('text/plain')).toBe('text')
    expect(bodyKind('image/png')).toBe('binary')
    expect(bodyKind('application/pdf')).toBe('binary')
  })

  it('assumes text when the server said nothing', () => {
    expect(bodyKind('')).toBe('text')
  })
})

describe('a page built to break the reader', () => {
  const deep = (count: number, tag = 'div'): string =>
    `<html><body>${`<${tag}>`.repeat(count)}hello${`</${tag}>`.repeat(count)}</body></html>`

  it('survives nesting far past anything a real page has', () => {
    // Every walk over the tree is recursive, so a fetched page's depth is this
    // app's call stack. Ten thousand nested divs overflowed it and failed the
    // fetch outright.
    expect(extractArticle(deep(10_000)).markdown).toContain('hello')
  })

  it('survives nesting that never closes', () => {
    const html = `<html><body>${'<div>'.repeat(20_000)}hello</body></html>`
    expect(extractArticle(html).markdown).toContain('hello')
  })

  it('survives deep inline nesting', () => {
    expect(extractArticle(`<body><p>${'<span>'.repeat(10_000)}hi</p></body>`).markdown).toContain(
      'hi',
    )
  })

  it('keeps the text it refused to keep the structure of', () => {
    // The nesting is what is dropped past the cap, never the content.
    expect(extractArticle(deep(MAX_DEPTH + 50)).markdown).toContain('hello')
  })

  it('still reads an ordinary page the same way', () => {
    expect(extractArticle('<body><article><p>normal</p></article></body>').markdown).toBe('normal')
  })
})
