/** The subset of markdown an agent actually writes.
 *
 *  Deliberately not a full parser. A thread column is not a document viewer,
 *  and anything unrecognised stays literal text rather than being
 *  half-interpreted — silently eating a character the agent wrote is a worse
 *  failure than not styling it.
 *
 *  Tables are the one common thing left out on purpose. */

export interface InlineSegment {
  text: string
  code: boolean
  /** Omitted rather than false, so a plain segment stays the shape it was. */
  bold?: boolean
}

export interface ListItem {
  segments: InlineSegment[]
  /** One level only. A deeper indent joins this level rather than growing a
   *  third — the same limit the ledger puts on nested tool rows, for the same
   *  reason: there is no indent past this that the column can afford. */
  children?: ListItem[]
  /** Set when the child list is numbered. */
  childrenOrdered?: boolean
}

export type MarkdownNode =
  | { type: 'paragraph'; segments: InlineSegment[] }
  | { type: 'heading'; level: 1 | 2 | 3; segments: InlineSegment[] }
  | { type: 'rule' }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'code'; lang: string; text: string }

const FENCE = /^```(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
/** Three or more of one marker, alone on the line. Checked before the bullet
 *  rule, because `---` is also a valid bullet to the eye of that rule. */
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const BULLET = /^(\s*)[-*]\s+(.*)$/
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/

/** How much deeper a line must be indented to become a child. Two spaces is
 *  what every agent and every formatter emits. */
const NEST_INDENT = 2

/** Splits `text` into plain, inline-code and bold segments.
 *
 *  One pass over both markers rather than two, because they nest: ``**a `b`
 *  c**`` is one bold run that contains a code segment, and running the two
 *  separately would lose whichever ran second. Inside code, `**` is literal —
 *  an agent writing a glob or an exponent means the characters. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let buffer = ''
  let code = false
  let bold = false

  const push = (): void => {
    if (buffer === '') return
    segments.push(bold ? { text: buffer, code, bold: true } : { text: buffer, code })
    buffer = ''
  }

  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '`') {
      push()
      code = !code
      continue
    }

    // Only a pair that closes is emphasis. An opener on its own is an
    // operator — `x ** y` is exponentiation in half the languages an agent
    // writes about — and reading it as emphasis would bold the rest of the
    // sentence and swallow the two characters it was written with.
    if (!code && text[at] === '*' && text[at + 1] === '*' && (bold || closes(text, at + 2))) {
      push()
      bold = !bold
      at += 1
      continue
    }

    buffer += text[at]
  }

  push()
  return segments
}

/** Whether a closing `**` appears after `from`, outside inline code. */
function closes(text: string, from: number): boolean {
  let code = false
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === '`') {
      code = !code
      continue
    }
    if (!code && text[at] === '*' && text[at + 1] === '*') return true
  }
  return false
}

/** Reads one run of list lines into items, nesting one level by indent. */
class ListBuilder {
  readonly ordered: boolean
  readonly indent: number
  readonly items: ListItem[] = []
  constructor(ordered: boolean, indent: number) {
    this.ordered = ordered
    this.indent = indent
  }

  add(indent: number, text: string, ordered: boolean): void {
    const parent = this.items[this.items.length - 1]

    if (parent && indent >= this.indent + NEST_INDENT) {
      parent.children ??= []
      parent.childrenOrdered ??= ordered
      parent.children.push({ segments: parseInline(text) })
      return
    }

    this.items.push({ segments: parseInline(text) })
  }

  /** Whether a line at this indent belongs to the list already open. A nested
   *  bullet under an ordered item is part of that item, not a new list — which
   *  is what used to restart the numbering at 1. */
  accepts(indent: number, ordered: boolean): boolean {
    if (indent >= this.indent + NEST_INDENT) return this.items.length > 0
    return ordered === this.ordered
  }
}

export function parseMarkdown(text: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = []
  const lines = text.split('\n')

  let paragraph: string[] = []
  let list: ListBuilder | null = null

  const flush = (): void => {
    if (paragraph.length > 0) {
      nodes.push({ type: 'paragraph', segments: parseInline(paragraph.join('\n')) })
      paragraph = []
    }
    if (list) {
      nodes.push({ type: 'list', ordered: list.ordered, items: list.items })
      list = null
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = FENCE.exec(line)

    if (fence) {
      flush()
      const body: string[] = []
      index += 1
      // An unclosed fence still opens a block: the agent is mid-stream, and the
      // text it has written so far belongs in the block it started.
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      nodes.push({ type: 'code', lang: fence[1].trim(), text: body.join('\n') })
      continue
    }

    if (RULE.test(line)) {
      flush()
      nodes.push({ type: 'rule' })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      // Clamped to three, because the rendering has three treatments. A `####`
      // that fell through to body text would read as a paragraph the agent
      // meant as a heading.
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3
      nodes.push({ type: 'heading', level, segments: parseInline(heading[2]) })
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    const item = bullet ?? numbered

    if (item) {
      const ordered = numbered !== null && bullet === null
      const indent = item[1].length
      if (paragraph.length > 0) flush()
      if (list && !list.accepts(indent, ordered)) flush()
      list ??= new ListBuilder(ordered, indent)
      list.add(indent, item[2], ordered)
      continue
    }

    if (line.trim() === '') {
      flush()
      continue
    }

    if (list) flush()
    paragraph.push(line)
  }

  flush()
  return nodes
}

/** The newest fenced block in `text`, or null. What `y` copies. */
export function lastCodeBlock(text: string): string | null {
  const blocks = parseMarkdown(text).filter((node) => node.type === 'code')
  const last = blocks.at(-1)
  return last?.type === 'code' ? last.text : null
}
