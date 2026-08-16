import { describe, expect, it } from 'vitest'
import { CLEAN, highlightBlock, highlightLine, isHighlighted } from './highlight'

/** The kinds a line produced, in order — what a reader would see as colour. */
const kinds = (line: string, lang: string, from = CLEAN): string[] =>
  highlightLine(line, lang, from).tokens.map((token) => token.kind)

const textOf = (line: string, lang: string): string =>
  highlightLine(line, lang).tokens.map((token) => token.text).join('')

describe('what it will colour', () => {
  it('knows the languages agents write', () => {
    for (const lang of ['ts', 'tsx', 'js', 'json', 'bash', 'sh', 'python', 'py', 'css', 'diff']) {
      expect(isHighlighted(lang)).toBe(true)
    }
  })

  it('refuses to guess at one it does not know', () => {
    expect(isHighlighted('brainfuck')).toBe(false)
    expect(kinds('const x = 1', 'brainfuck')).toEqual(['plain'])
  })

  it('is not case sensitive about the fence tag', () => {
    expect(isHighlighted('TypeScript')).toBe(true)
  })
})

describe('never loses a character', () => {
  const lines = [
    'const x = "a"; // note',
    '  if (a && b) { return `t${x}` }',
    'echo "$HOME" # comment',
    'def f(a, b): return a + b  # sum',
    '/* opener */ const y = 2',
    'x = 0x1f + 3.14',
    '',
  ]

  it('puts the line back together exactly', () => {
    // The one property that must never break: colouring is a view of the text,
    // so what comes out has to be what went in.
    for (const lang of ['ts', 'bash', 'python', 'css', 'json']) {
      for (const line of lines) expect(textOf(line, lang)).toBe(line)
    }
  })
})

describe('typescript', () => {
  it('separates keyword, name, string and comment', () => {
    expect(kinds('const x = "a" // note', 'ts')).toEqual([
      'keyword',
      'plain',
      'string',
      'plain',
      'comment',
    ])
  })

  it('reads a number', () => {
    const tokens = highlightLine('const n = 42', 'ts').tokens
    expect(tokens.find((t) => t.kind === 'number')?.text).toBe('42')
  })

  it('does not read a digit inside a name as a number', () => {
    const tokens = highlightLine('const x2 = 1', 'ts').tokens
    expect(tokens.filter((t) => t.kind === 'number').map((t) => t.text)).toEqual(['1'])
  })

  it('leaves a keyword alone inside a string', () => {
    expect(kinds('"const"', 'ts')).toEqual(['string'])
  })

  it('leaves a quote alone inside a comment', () => {
    expect(kinds("// it's fine", 'ts')).toEqual(['comment'])
  })

  it('honours a backslash escape rather than closing early', () => {
    const tokens = highlightLine('const s = "a\\"b" + 1', 'ts').tokens
    expect(tokens.find((t) => t.kind === 'string')?.text).toBe('"a\\"b"')
  })
})

describe('state carried between lines', () => {
  it('keeps a block comment open until it closes', () => {
    const one = highlightLine('/* opens here', 'ts')
    expect(one.to.inBlockComment).toBe(true)

    const two = highlightLine('still a comment', 'ts', one.to)
    expect(two.tokens).toEqual([{ text: 'still a comment', kind: 'comment' }])
    expect(two.to.inBlockComment).toBe(true)

    const three = highlightLine('closes */ const x = 1', 'ts', two.to)
    expect(three.to.inBlockComment).toBe(false)
    expect(three.tokens.map((t) => t.kind)).toEqual(['comment', 'plain', 'keyword', 'plain', 'number'])
  })

  it('ends an unterminated string at the line, as an editor does', () => {
    const { to } = highlightLine('const s = "never closed', 'ts')
    expect(to.inBlockComment).toBe(false)
    // The next line starts clean, so one stray quote cannot dye the rest.
    expect(kinds('const t = 1', 'ts', to)).toEqual(['keyword', 'plain', 'number'])
  })

  it('opens and closes a block comment on one line', () => {
    const { tokens, to } = highlightLine('const /* mid */ x = 1', 'ts')
    expect(to.inBlockComment).toBe(false)
    expect(tokens.filter((t) => t.kind === 'comment').map((t) => t.text)).toEqual(['/* mid */'])
  })
})

describe('the other grammars', () => {
  it('reads a hash as a comment in bash but not in css', () => {
    expect(kinds('echo hi # note', 'bash')).toContain('comment')
    expect(kinds('#main { color: red }', 'css')).not.toContain('comment')
  })

  it('reads json without pretending it has keywords it does not', () => {
    expect(kinds('{ "a": true }', 'json')).toEqual(['plain', 'string', 'plain', 'keyword', 'plain'])
  })

  it('colours a diff by its sign and leaves the body alone', () => {
    expect(kinds('+ const x = 1', 'diff')).toEqual(['keyword'])
    expect(kinds('- const x = 1', 'diff')).toEqual(['number'])
    expect(kinds('@@ -1,4 +1,6 @@', 'diff')).toEqual(['comment'])
    expect(kinds('  unchanged', 'diff')).toEqual(['plain'])
  })
})

describe('a whole block', () => {
  it('threads the carry state down the lines', () => {
    const lines = highlightBlock('/*\n a\n*/\nconst x = 1', 'ts')

    expect(lines).toHaveLength(4)
    expect(lines[1]).toEqual([{ text: ' a', kind: 'comment' }])
    expect(lines[3][0]).toEqual({ text: 'const', kind: 'keyword' })
  })

  it('survives a line with nothing on it', () => {
    expect(highlightBlock('a\n\nb', 'ts')).toHaveLength(3)
  })
})
