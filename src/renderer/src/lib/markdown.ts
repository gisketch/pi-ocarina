/** The markdown an agent actually writes.
 *
 *  Deliberately not a full parser, but an open one: block kinds live in
 *  `markdown-block.ts` as an ordered rule list, inline markers in
 *  `markdown-inline.ts`. Adding a kind touches those two and a component —
 *  never this file's shape, and never a caller.
 *
 *  Anything unrecognised stays literal text. Silently eating a character the
 *  agent wrote is a worse failure than not styling it. */

import { RULES, type ListItem, type MarkdownNode } from './markdown-block'
import { parseInline } from './markdown-inline'

export type { InlineSegment } from './markdown-inline'
export type { ListItem, MarkdownNode, TableCell } from './markdown-block'
export { STANDALONE } from './markdown-block'
export { parseInline, safeHref } from './markdown-inline'

/** Lists are the one block a rule cannot own, because an item's membership
 *  depends on the item above it. They stay here, ahead of the rule list. */
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/
const TASK = /^\[([ xX])\]\s+(.*)$/

/** How much deeper a line must be indented to become a child. Two spaces is
 *  what every agent and every formatter emits. */
const NEST_INDENT = 2

function item(text: string): ListItem {
  const task = TASK.exec(text)
  if (!task) return { segments: parseInline(text) }
  return { segments: parseInline(task[2]), done: task[1].toLowerCase() === 'x' }
}

/** Reads one run of list lines into items, nesting one level by indent. */
class ListBuilder {
  readonly ordered: boolean
  readonly indent: number
  readonly items: ListItem[] = []
  /** The number the agent actually wrote first. A list that starts at 10 is
   *  usually the second half of one, and renumbering it from 1 tells the
   *  reader something the agent did not. */
  readonly start: number

  constructor(ordered: boolean, indent: number, start: number) {
    this.ordered = ordered
    this.indent = indent
    this.start = start
  }

  add(indent: number, text: string, ordered: boolean): void {
    const parent = this.items[this.items.length - 1]

    if (parent && indent >= this.indent + NEST_INDENT) {
      parent.children ??= []
      parent.childrenOrdered ??= ordered
      parent.children.push(item(text))
      return
    }

    this.items.push(item(text))
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
      nodes.push({
        type: 'list',
        ordered: list.ordered,
        items: list.items,
        ...(list.ordered && list.start !== 1 ? { start: list.start } : {}),
      })
      list = null
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    let claimed: { node: MarkdownNode; consumed: number } | null = null
    for (const rule of RULES) {
      claimed = rule.read(lines, index)
      if (claimed) break
    }

    if (claimed) {
      flush()
      nodes.push(claimed.node)
      index += claimed.consumed - 1
      continue
    }

    const line = lines[index]
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    const entry = bullet ?? numbered

    if (entry) {
      const ordered = numbered !== null && bullet === null
      const indent = entry[1].length
      if (paragraph.length > 0) flush()
      if (list && !list.accepts(indent, ordered)) flush()
      list ??= new ListBuilder(ordered, indent, Number(/^\s*(\d+)/.exec(line)?.[1] ?? 1))
      list.add(indent, entry[2], ordered)
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
