/** A forgiving HTML tokenizer, and the entity table it needs.
 *
 *  Not a DOM and not a parser you would build a browser on. Extraction needs a
 *  stream of "a tag opened, a tag closed, here is some text" and nothing more,
 *  and a real DOM costs `jsdom` — twenty-one packages inside an Electron
 *  bundle — to answer a question this file answers in a page of code.
 *
 *  Forgiving is the requirement, not a compromise: the pages worth reading are
 *  full of unclosed `<li>`, stray `<` in prose, and attributes with no quotes.
 *  Every unknown shape here becomes text rather than an error. */

export type HtmlToken =
  | { type: 'open'; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: 'close'; name: string }
  | { type: 'text'; text: string }

/** Elements with no closing tag. Treated as self-closing however they appear. */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** Elements whose content is not markup. A `<` inside a script is a less-than
 *  sign, and treating it as a tag turns the rest of the page into soup. */
const RAW = new Set(['script', 'style', 'textarea', 'title'])

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  middot: '·',
  bull: '•',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  euro: '€',
  pound: '£',
  yen: '¥',
  sect: '§',
  para: '¶',
  dagger: '†',
  larr: '←',
  rarr: '→',
  harr: '↔',
  check: '✓',
}

/** Turns `&amp;` and `&#8212;` into the characters they name.
 *
 *  A semicolon is required. Without that rule `AT&T` loses its ampersand, and
 *  prose is more common on a web page than a malformed entity. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text

  return text.replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      // Anything outside Unicode, and the surrogate range, is left as written
      // rather than thrown: a page with one bad entity still has its prose.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      if (code >= 0xd800 && code <= 0xdfff) return whole
      return String.fromCodePoint(code)
    }
    const named = NAMED[body] ?? NAMED[body.toLowerCase()]
    return named ?? whole
  })
}

/** Reads the attributes between a tag name and its `>`.
 *
 *  Returns where it stopped so the caller can continue after the tag. */
function readAttrs(
  html: string,
  from: number,
): { attrs: Record<string, string>; end: number; selfClosing: boolean } {
  const attrs: Record<string, string> = {}
  let i = from
  let selfClosing = false

  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i])) i += 1
    if (i >= html.length) break

    if (html[i] === '>') {
      i += 1
      break
    }
    if (html[i] === '/' && html[i + 1] === '>') {
      selfClosing = true
      i += 2
      break
    }

    const nameStart = i
    while (i < html.length && !/[\s=/>]/.test(html[i])) i += 1
    // A lone `/` or `=` where a name should be: skip it rather than spin.
    if (i === nameStart) {
      i += 1
      continue
    }
    const name = html.slice(nameStart, i).toLowerCase()

    while (i < html.length && /\s/.test(html[i])) i += 1
    if (html[i] !== '=') {
      attrs[name] = ''
      continue
    }

    i += 1
    while (i < html.length && /\s/.test(html[i])) i += 1

    const quote = html[i]
    if (quote === '"' || quote === "'") {
      const close = html.indexOf(quote, i + 1)
      const end = close === -1 ? html.length : close
      attrs[name] = decodeEntities(html.slice(i + 1, end))
      i = end + 1
    } else {
      const valueStart = i
      while (i < html.length && !/[\s>]/.test(html[i])) i += 1
      attrs[name] = decodeEntities(html.slice(valueStart, i))
    }
  }

  return { attrs, end: i, selfClosing }
}

/** Every tag and every run of text, in order. */
export function tokenize(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let i = 0

  const pushText = (raw: string): void => {
    if (raw === '') return
    tokens.push({ type: 'text', text: decodeEntities(raw) })
  }

  while (i < html.length) {
    const next = html.indexOf('<', i)
    if (next === -1) {
      pushText(html.slice(i))
      break
    }
    pushText(html.slice(i, next))
    i = next

    if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4)
      i = close === -1 ? html.length : close + 3
      continue
    }
    // Doctypes, processing instructions, CDATA: carry nothing worth reading.
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      const close = html.indexOf('>', i)
      i = close === -1 ? html.length : close + 1
      continue
    }

    if (html.startsWith('</', i)) {
      const close = html.indexOf('>', i)
      const end = close === -1 ? html.length : close
      const name = html.slice(i + 2, end).trim().toLowerCase()
      if (name !== '') tokens.push({ type: 'close', name })
      i = end + 1
      continue
    }

    const nameStart = i + 1
    let cursor = nameStart
    while (cursor < html.length && !/[\s/>]/.test(html[cursor])) cursor += 1
    const name = html.slice(nameStart, cursor).toLowerCase()

    // `<` followed by anything that is not a tag name is a less-than sign.
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      pushText('<')
      i += 1
      continue
    }

    const { attrs, end, selfClosing } = readAttrs(html, cursor)
    const empty = selfClosing || VOID.has(name)
    tokens.push({ type: 'open', name, attrs, selfClosing: empty })
    i = end

    if (empty || !RAW.has(name)) continue

    // Raw text: everything up to the matching close tag is one text run, and
    // no `<` inside it opens anything.
    const closing = new RegExp(`</${name}\\s*>`, 'i')
    const rest = html.slice(i)
    const found = closing.exec(rest)
    const body = found ? rest.slice(0, found.index) : rest
    if (body !== '') tokens.push({ type: 'text', text: decodeEntities(body) })
    tokens.push({ type: 'close', name })
    i = found ? i + found.index + found[0].length : html.length
  }

  return tokens
}
