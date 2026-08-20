/** Marking the files a message carries, wherever their names appear in it.
 *
 *  A post-pass over parsed segments rather than a rule inside the parser. An
 *  attachment's name is not syntax — it is a string that happens to be a
 *  filename this particular message was sent with — and teaching the inline
 *  grammar about it would mean handing the parser a list of names on every
 *  call, for a case that only ever applies to a sent user message.
 *
 *  Code spans and links are left alone. A path inside backticks is being
 *  quoted, not referred to, and a chip drawn over a link would take its
 *  destination with it. */

import type { ListItem, MarkdownNode } from './markdown-block'
import type { InlineSegment, MessageAttachment } from './thread'

/** Longest first, so `report.old.png` is not swallowed by `report.old`. */
function byLength(attachments: readonly MessageAttachment[]): MessageAttachment[] {
  return [...attachments].sort((a, b) => b.name.length - a.name.length)
}

function markOne(segment: InlineSegment, names: readonly MessageAttachment[]): InlineSegment[] {
  if (segment.code || segment.href || segment.mention) return [segment]

  for (const attachment of names) {
    const at = segment.text.indexOf(attachment.name)
    if (at === -1) continue

    const before = segment.text.slice(0, at)
    const after = segment.text.slice(at + attachment.name.length)
    return [
      ...(before === '' ? [] : markOne({ ...segment, text: before }, names)),
      { ...segment, text: attachment.name, attachment: attachment.name },
      ...(after === '' ? [] : markOne({ ...segment, text: after }, names)),
    ]
  }
  return [segment]
}

/** The segments, with every mention of an attached file marked as a chip. */
export function markAttachments(
  segments: readonly InlineSegment[],
  attachments: readonly MessageAttachment[] = [],
): InlineSegment[] {
  if (attachments.length === 0) return [...segments]
  const names = byLength(attachments.filter((one) => one.name !== ''))
  return segments.flatMap((segment) => markOne(segment, names))
}

/** The files whose names the message never said.
 *
 *  They still travelled with it, so they are still drawn — as chips after the
 *  text rather than a paragraph describing them. Nothing attached is ever
 *  invisible. */
export function unnamedIn(
  text: string,
  attachments: readonly MessageAttachment[] = [],
): MessageAttachment[] {
  return attachments.filter((one) => one.name !== '' && !text.includes(one.name))
}

/** The parsed message, with its chips marked.
 *
 *  Walks the node kinds that hold prose. A fence is code and a table is data;
 *  neither is a sentence a reader refers to a file in, and marking inside them
 *  would be marking a coincidence. */
export function markNodes(
  nodes: readonly MarkdownNode[],
  attachments: readonly MessageAttachment[] = [],
): MarkdownNode[] {
  // The input untouched, not a copy: with nothing to mark this is the identity
  // pass, and the caller's memoized readers (`segmentsOfCached`) recognise a
  // parse they have seen only by the array staying the same array.
  if (attachments.length === 0) return nodes as MarkdownNode[]

  return nodes.map((node): MarkdownNode => {
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'quote') {
      return { ...node, segments: markAttachments(node.segments, attachments) }
    }
    if (node.type === 'list') {
      return { ...node, items: node.items.map((item) => markItem(item, attachments)) }
    }
    return node
  })
}

function markItem(item: ListItem, attachments: readonly MessageAttachment[]): ListItem {
  return {
    ...item,
    segments: markAttachments(item.segments, attachments),
    ...(item.children
      ? { children: item.children.map((child) => markItem(child, attachments)) }
      : {}),
  }
}
