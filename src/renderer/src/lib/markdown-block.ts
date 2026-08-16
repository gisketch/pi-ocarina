/** Block-level markdown, as an ordered list of rules.
 *
 *  A rule looks at the line the reader is on, and says either "not mine" or
 *  "mine, and here is the node and how many lines it took". Adding a kind —
 *  a screenshot, a skill chip, whatever the agent learns to emit next — means
 *  adding one rule here, one node kind in `markdown.ts`, and one component in
 *  `components/thread/md/`. Nothing else in the app has to know.
 *
 *  Order matters and is the rules' own business: `---` has to be tried before
 *  the bullet rule, which would also claim it, and a fence has to be tried
 *  before everything, because inside one nothing else is markup at all. */

import { type InlineSegment, parseInline, safeHref } from './markdown-inline'

export interface ListItem {
  segments: InlineSegment[]
  /** One level only — the same limit the ledger puts on nested tool rows. */
  children?: ListItem[]
  childrenOrdered?: boolean
  /** The number a nested ordered list starts at, when it is not one. */
  childrenStart?: number
  /** Set for `- [ ]` and `- [x]`, which agents write constantly. */
  done?: boolean
}

export interface TableCell {
  segments: InlineSegment[]
}

export type MarkdownNode =
  | { type: 'paragraph'; segments: InlineSegment[] }
  | { type: 'heading'; level: 1 | 2 | 3; segments: InlineSegment[] }
  | { type: 'rule' }
  | { type: 'list'; ordered: boolean; items: ListItem[]; start?: number }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; segments: InlineSegment[] }
  | { type: 'table'; head: TableCell[]; rows: TableCell[][] }
  | { type: 'image'; alt: string; src: string }

/** Kinds that stand alone as a stop for `j`, rather than grouping with the
 *  prose around them. A future screenshot belongs here the day it arrives. */
export const STANDALONE: ReadonlySet<MarkdownNode['type']> = new Set(['code', 'table', 'image'])

export interface Rule {
  /** Null when the rule does not claim this line. */
  read(lines: string[], at: number): { node: MarkdownNode; consumed: number } | null
}

const FENCE = /^```(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const THEMATIC = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s*>\s?(.*)$/
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/
const TABLE_ROW = /^\s*\|(.+)\|\s*$/
const TABLE_DIVIDER = /^\s*\|[\s:|-]+\|\s*$/

const cells = (line: string): TableCell[] =>
  (TABLE_ROW.exec(line)?.[1] ?? '')
    .split('|')
    .map((cell) => ({ segments: parseInline(cell.trim()) }))

/** Every rule, in the order they are tried. */
export const RULES: Rule[] = [
  // A fence first: inside one, nothing is markup.
  {
    read(lines, at) {
      const fence = FENCE.exec(lines[at])
      if (!fence) return null

      const body: string[] = []
      let cursor = at + 1
      // An unclosed fence still opens a block: the agent is mid-stream, and
      // what it has written belongs in the block it started.
      while (cursor < lines.length && !FENCE.test(lines[cursor])) {
        body.push(lines[cursor])
        cursor += 1
      }

      const consumed = Math.min(cursor + 1, lines.length) - at
      return { node: { type: 'code', lang: fence[1].trim(), text: body.join('\n') }, consumed }
    },
  },

  // Before the bullet rule, which would also claim `---`.
  {
    read(lines, at) {
      return THEMATIC.test(lines[at]) ? { node: { type: 'rule' }, consumed: 1 } : null
    },
  },

  {
    read(lines, at) {
      const heading = HEADING.exec(lines[at])
      if (!heading) return null

      // Clamped to three, because the rendering has three treatments. A `####`
      // falling through to body text would read as a paragraph the agent meant
      // as a heading.
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3
      return { node: { type: 'heading', level, segments: parseInline(heading[2]) }, consumed: 1 }
    },
  },

  // An image alone on its line. This is the seam a screenshot arrives through.
  {
    read(lines, at) {
      const image = IMAGE.exec(lines[at])
      if (!image) return null

      const src = safeHref(image[2]) ?? (image[2].startsWith('data:image/') ? image[2] : null)
      if (src === null) return null

      return { node: { type: 'image', alt: image[1], src }, consumed: 1 }
    },
  },

  // A table needs its divider, or `| a |` in prose becomes one.
  {
    read(lines, at) {
      if (!TABLE_ROW.test(lines[at]) || !TABLE_DIVIDER.test(lines[at + 1] ?? '')) return null

      const head = cells(lines[at])
      const rows: TableCell[][] = []
      let cursor = at + 2
      while (cursor < lines.length && TABLE_ROW.test(lines[cursor])) {
        rows.push(cells(lines[cursor]))
        cursor += 1
      }

      return { node: { type: 'table', head, rows }, consumed: cursor - at }
    },
  },

  {
    read(lines, at) {
      if (!QUOTE.test(lines[at])) return null

      const body: string[] = []
      let cursor = at
      while (cursor < lines.length) {
        const quote = QUOTE.exec(lines[cursor])
        if (!quote) break
        body.push(quote[1])
        cursor += 1
      }

      return { node: { type: 'quote', segments: parseInline(body.join('\n')) }, consumed: cursor - at }
    },
  },
]
