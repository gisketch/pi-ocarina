/** Where a message breaks into things the reader can point at.
 *
 *  A fenced block is its own stop for `j`; the prose around it is another. The
 *  rule lives here rather than in either caller because two of them need it —
 *  the nav model and the renderer — and if they ever disagreed the ring would
 *  point at a block nobody drew. */

import { STANDALONE, type ListItem, type MarkdownNode } from './markdown'

/** Consecutive prose nodes group; a standalone kind is a stop of its own.
 *
 *  Which kinds those are is `STANDALONE`'s to say, so a new one — a
 *  screenshot, a chart — becomes its own stop by being named there. */
export function segmentsOf(nodes: MarkdownNode[]): MarkdownNode[][] {
  const segments: MarkdownNode[][] = []
  let text: MarkdownNode[] = []

  for (const node of nodes) {
    if (STANDALONE.has(node.type)) {
      if (text.length > 0) segments.push(text)
      text = []
      segments.push([node])
      continue
    }
    text.push(node)
  }

  if (text.length > 0) segments.push(text)
  return segments
}

/** A list's text, children included. Dropping them would hand the reader a
 *  copy that is missing the lines they could see. */
function listText(items: ListItem[]): string {
  return items
    .map((item) => {
      const own = item.segments.map((segment) => segment.text).join('')
      return item.children ? `${own}\n${listText(item.children)}` : own
    })
    .join('\n')
}

/** The source a segment copies. Code copies its code; prose copies its own
 *  text, which is what the reader would have selected by hand. */
export function segmentText(segment: MarkdownNode[]): string {
  return segment
    .map((node) => {
      switch (node.type) {
        case 'code':
          return node.text
        case 'rule':
          return '---'
        case 'list':
          return listText(node.items)
        case 'image':
          return node.src
        case 'table':
          return [node.head, ...node.rows]
            .map((row) => row.map((cell) => cell.segments.map((s) => s.text).join('')).join('\t'))
            .join('\n')
        default:
          return node.segments.map((segment) => segment.text).join('')
      }
    })
    .join('\n')
}
