/** Where a message breaks into things the reader can point at.
 *
 *  A fenced block is its own stop for `j`; the prose around it is another. The
 *  rule lives here rather than in either caller because two of them need it —
 *  the nav model and the renderer — and if they ever disagreed the ring would
 *  point at a block nobody drew. */

import type { ListItem, MarkdownNode } from './markdown'

/** Consecutive non-code nodes group; a code node stands alone. */
export function segmentsOf(nodes: MarkdownNode[]): MarkdownNode[][] {
  const segments: MarkdownNode[][] = []
  let text: MarkdownNode[] = []

  for (const node of nodes) {
    if (node.type === 'code') {
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
      if (node.type === 'code') return node.text
      if (node.type === 'rule') return '---'
      if (node.type === 'list') return listText(node.items)
      return node.segments.map((s) => s.text).join('')
    })
    .join('\n')
}
