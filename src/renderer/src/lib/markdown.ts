/** The small subset of markdown an agent actually writes.
 *
 *  Deliberately not a full parser. The reference styles three things —
 *  inline code, lists, fenced blocks — and a thread column is not a document
 *  viewer. Anything unrecognised stays literal text rather than being
 *  half-interpreted, because silently eating a character the agent wrote is a
 *  worse failure than not styling it. */

export interface InlineSegment {
  text: string
  code: boolean
}

export type MarkdownNode =
  | { type: 'paragraph'; segments: InlineSegment[] }
  | { type: 'list'; ordered: boolean; items: InlineSegment[][] }
  | { type: 'code'; lang: string; text: string }

const FENCE = /^```(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

/** Splits `text` on backticks into plain and inline-code segments. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let rest = text
  let code = false

  while (rest.length > 0) {
    const tick = rest.indexOf('`')
    if (tick === -1) {
      segments.push({ text: rest, code })
      break
    }
    if (tick > 0) segments.push({ text: rest.slice(0, tick), code })
    rest = rest.slice(tick + 1)
    code = !code
  }

  return segments.filter((segment) => segment.text.length > 0)
}

export function parseMarkdown(text: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = []
  const lines = text.split('\n')

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = (): void => {
    if (paragraph.length > 0) {
      nodes.push({ type: 'paragraph', segments: parseInline(paragraph.join('\n')) })
      paragraph = []
    }
    if (list) {
      nodes.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) })
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

    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    const item = bullet ?? numbered

    if (item) {
      const ordered = numbered !== null && bullet === null
      if (paragraph.length > 0) flush()
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push(item[1])
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
