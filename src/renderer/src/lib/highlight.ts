/** Syntax colouring for fenced code, one line at a time.
 *
 *  Line by line, and each line starts from the state the line above ended in.
 *  That is what makes it cheap while a block streams: only the line being
 *  written is re-read, not the four hundred above it.
 *
 *  One left-to-right pass with an index, and no regular expressions. A block
 *  arrives from a model and can contain anything; a backtracking pattern on a
 *  pathological line would hang the renderer, and a dropped frame here is a
 *  dropped frame in the middle of an answer. */

export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'punct' | 'name'

export interface Token {
  text: string
  kind: TokenKind
}

/** What carries from one line to the next. A string that never closes ends at
 *  the line, the way every editor treats one; a block comment does not. */
export interface LineState {
  inBlockComment: boolean
}

export const CLEAN: LineState = { inBlockComment: false }

interface Grammar {
  keywords: ReadonlySet<string>
  /** Starts a comment that runs to the end of the line. */
  lineComment: string[]
  /** Opens and closes a comment that can span lines. */
  blockComment?: { open: string; close: string }
  quotes: string[]
  /** Whether a backslash escapes the next character inside a string. */
  escapes: boolean
}

const words = (list: string): ReadonlySet<string> => new Set(list.split(' '))

const JS: Grammar = {
  keywords: words(
    'const let var function return if else for while do break continue new class extends ' +
      'import export from default async await try catch finally throw typeof instanceof in of ' +
      'null undefined true false this super static get set yield delete void interface type ' +
      'enum implements public private protected readonly as satisfies keyof infer never unknown',
  ),
  lineComment: ['//'],
  blockComment: { open: '/*', close: '*/' },
  quotes: ['"', "'", '`'],
  escapes: true,
}

const GRAMMARS: Record<string, Grammar> = {
  js: JS,
  jsx: JS,
  ts: JS,
  tsx: JS,
  javascript: JS,
  typescript: JS,
  json: {
    keywords: words('true false null'),
    lineComment: [],
    quotes: ['"'],
    escapes: true,
  },
  css: {
    keywords: words('important inherit initial unset auto none var calc'),
    lineComment: [],
    blockComment: { open: '/*', close: '*/' },
    quotes: ['"', "'"],
    escapes: true,
  },
  bash: {
    keywords: words(
      'if then else elif fi for while do done case esac function return export local ' +
        'source echo cd set unset trap exit read shift',
    ),
    lineComment: ['#'],
    quotes: ['"', "'"],
    escapes: true,
  },
  python: {
    keywords: words(
      'def class return if elif else for while break continue import from as pass raise ' +
        'try except finally with lambda yield global nonlocal assert del in is not and or ' +
        'None True False self async await',
    ),
    lineComment: ['#'],
    quotes: ['"', "'"],
    escapes: true,
  },
  html: {
    keywords: words(''),
    lineComment: [],
    blockComment: { open: '<!--', close: '-->' },
    quotes: ['"', "'"],
    escapes: false,
  },
}

GRAMMARS.sh = GRAMMARS.bash
GRAMMARS.zsh = GRAMMARS.bash
GRAMMARS.shell = GRAMMARS.bash
GRAMMARS.py = GRAMMARS.python
GRAMMARS.xml = GRAMMARS.html
GRAMMARS.svelte = GRAMMARS.html

/** Whether a language is coloured at all. An unknown one renders as plain
 *  text: guessing at a grammar paints the wrong words, which is worse than
 *  painting none. */
export function isHighlighted(lang: string): boolean {
  return lang.toLowerCase() in GRAMMARS || lang.toLowerCase() === 'diff'
}

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9'
const isWordChar = (ch: string): boolean =>
  (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || isDigit(ch) || ch === '_' || ch === '$'

/** A diff is coloured by its first character and nothing else. Reading the
 *  body as code would fight the sign, which is the only thing that matters. */
function diffLine(line: string): Token[] {
  if (line.startsWith('+')) return [{ text: line, kind: 'keyword' }]
  if (line.startsWith('-')) return [{ text: line, kind: 'number' }]
  if (line.startsWith('@@')) return [{ text: line, kind: 'comment' }]
  return [{ text: line, kind: 'plain' }]
}

/** Colours one line, and reports the state the next line starts in. */
export function highlightLine(
  line: string,
  lang: string,
  from: LineState = CLEAN,
): { tokens: Token[]; to: LineState } {
  const key = lang.toLowerCase()
  if (key === 'diff') return { tokens: diffLine(line), to: CLEAN }

  const grammar = GRAMMARS[key]
  if (!grammar) return { tokens: [{ text: line, kind: 'plain' }], to: CLEAN }

  const tokens: Token[] = []
  let inBlockComment = from.inBlockComment
  let at = 0
  let plain = ''

  const flush = (): void => {
    if (plain === '') return
    tokens.push({ text: plain, kind: 'plain' })
    plain = ''
  }
  const push = (text: string, kind: TokenKind): void => {
    flush()
    tokens.push({ text, kind })
  }

  while (at < line.length) {
    if (inBlockComment) {
      const close = grammar.blockComment
        ? line.indexOf(grammar.blockComment.close, at)
        : -1
      if (close === -1) {
        push(line.slice(at), 'comment')
        at = line.length
        break
      }
      const end = close + (grammar.blockComment?.close.length ?? 0)
      push(line.slice(at, end), 'comment')
      at = end
      inBlockComment = false
      continue
    }

    const rest = line.slice(at)

    if (grammar.blockComment && rest.startsWith(grammar.blockComment.open)) {
      const { open, close } = grammar.blockComment
      // Searched past the opener, so `/*/` does not read as opened and closed.
      const end = line.indexOf(close, at + open.length)
      if (end === -1) {
        push(line.slice(at), 'comment')
        at = line.length
        inBlockComment = true
        break
      }
      push(line.slice(at, end + close.length), 'comment')
      at = end + close.length
      continue
    }

    const lineComment = grammar.lineComment.find((marker) => rest.startsWith(marker))
    if (lineComment) {
      push(line.slice(at), 'comment')
      at = line.length
      break
    }

    const quote = grammar.quotes.find((q) => rest.startsWith(q))
    if (quote) {
      let cursor = at + quote.length
      while (cursor < line.length) {
        if (grammar.escapes && line[cursor] === '\\') {
          cursor += 2
          continue
        }
        if (line.startsWith(quote, cursor)) {
          cursor += quote.length
          break
        }
        cursor += 1
      }
      // An unterminated string ends at the line, the way an editor shows it.
      push(line.slice(at, Math.min(cursor, line.length)), 'string')
      at = Math.min(cursor, line.length)
      continue
    }

    const ch = line[at]

    if (isDigit(ch) && !isWordChar(line[at - 1] ?? ' ')) {
      let cursor = at
      while (cursor < line.length && (isWordChar(line[cursor]) || line[cursor] === '.')) cursor += 1
      push(line.slice(at, cursor), 'number')
      at = cursor
      continue
    }

    if (isWordChar(ch)) {
      let cursor = at
      while (cursor < line.length && isWordChar(line[cursor])) cursor += 1
      const word = line.slice(at, cursor)
      if (grammar.keywords.has(word)) push(word, 'keyword')
      else plain += word
      at = cursor
      continue
    }

    plain += ch
    at += 1
  }

  flush()
  return { tokens, to: { inBlockComment } }
}

/** Every line of a block, threaded through the carry state.
 *
 *  For a block that is not streaming. A streaming one should call
 *  `highlightLine` per line so an arriving token only re-reads its own line. */
export function highlightBlock(text: string, lang: string): Token[][] {
  let state = CLEAN
  return text.split('\n').map((line) => {
    const { tokens, to } = highlightLine(line, lang, state)
    state = to
    return tokens
  })
}
