/** Drawing a named skill as a chip in the sent message.
 *
 *  The composer shows `/name` as one chip; pi expands it before the model
 *  sees anything, so the transcript's copy of the message carries the whole
 *  `<skill name=… location=…>…</skill>` block — a wall of instructions where
 *  the reader typed one word. Both are the same thing, so both draw the
 *  same: the block collapses back to pi's short `/skill:name` form before
 *  markdown, and a post-pass marks that form as a chip carrying the bare
 *  name — the same shape `markAttachments` uses for files.
 *
 *  User messages only: an agent quoting a `<skill>` block is talking *about*
 *  one, not invoking it. */

import type { ListItem, MarkdownNode } from './markdown-block'
import type { InlineSegment } from './thread'

/** One closed block. Non-greedy body, so two blocks in one message stay two.
 *  An unclosed tag matches nothing — better a wall of text than silently
 *  eating the rest of the message. */
const BLOCK = /<skill\s+name="([^"]+)"[^>]*>[\s\S]*?<\/skill>/g

/** Every closed `<skill>` block folded to `/skill:name`.
 *
 *  Fenced code is left as written: a block inside backticks is being quoted,
 *  not invoked. The split walks fence delimiters so only the prose between
 *  them is transformed. */
export function collapseSkills(text: string): string {
  const parts = text.split(/(^```.*$)/m)
  let fenced = false
  return parts
    .map((part) => {
      if (/^```/.test(part)) {
        fenced = !fenced
        return part
      }
      return fenced ? part : part.replace(BLOCK, '/skill:$1')
    })
    .join('')
}

/** `/skill:name` at the start of a run or after whitespace — the same
 *  boundary rule the composer's own chip uses, so `path/skill:odd` stays a
 *  path. */
const SHORT = /(^|\s)\/skill:([A-Za-z0-9._-]+)/

function markOne(segment: InlineSegment): InlineSegment[] {
  if (segment.code || segment.href || segment.mention) return [segment]

  const match = SHORT.exec(segment.text)
  if (!match) return [segment]

  const at = match.index + match[1].length
  const name = match[2]
  const before = segment.text.slice(0, at)
  const after = segment.text.slice(at + '/skill:'.length + name.length)
  return [
    ...(before === '' ? [] : [{ ...segment, text: before }]),
    // The bare name: the chip should read as the thing the reader picked,
    // not as the namespace pi expands.
    { ...segment, text: name, skill: name },
    ...(after === '' ? [] : markOne({ ...segment, text: after })),
  ]
}

/** The segments, with every `/skill:name` marked as a chip. */
export function markSkills(segments: readonly InlineSegment[]): InlineSegment[] {
  return segments.flatMap((segment) => markOne(segment))
}

/** The parsed message, with its skill chips marked. The same prose-holding
 *  node kinds `markNodes` walks; a fence is a quotation. */
export function markSkillNodes(nodes: readonly MarkdownNode[]): MarkdownNode[] {
  return nodes.map((node): MarkdownNode => {
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'quote') {
      return { ...node, segments: markSkills(node.segments) }
    }
    if (node.type === 'list') {
      return { ...node, items: node.items.map(markItem) }
    }
    return node
  })
}

function markItem(item: ListItem): ListItem {
  return {
    ...item,
    segments: markSkills(item.segments),
    ...(item.children ? { children: item.children.map(markItem) } : {}),
  }
}
