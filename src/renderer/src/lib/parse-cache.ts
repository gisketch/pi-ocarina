/** The memoized face of the markdown parser.
 *
 *  A message's text is parsed by more than one reader — the renderer draws it,
 *  the nav model splits it into stops, the copy key reads its segments — and
 *  each of them used to parse from scratch, per keypress and per streamed
 *  token. The text itself never changes once written, so the parse is a pure
 *  function of it: remembered here, every reader after the first is free.
 *
 *  Safe to share because everything downstream is pure: `markNodes`,
 *  `markSkillNodes` and `segmentsOf` copy what they change and never write
 *  into the nodes they were handed. A pass that started mutating nodes would
 *  corrupt every other reader of the same text — that is the one contract
 *  this cache adds.
 *
 *  Bounded: the string caches hold the most recent entries (a long thread's
 *  visible messages fit with room to spare) and evict oldest-first; the
 *  by-identity caches are WeakMaps and follow their keys out. */

import { parseMarkdown, type MarkdownNode } from './markdown'
import { parseInline, type InlineSegment } from './markdown-inline'
import { segmentsOf, segmentText } from './markdown-segments'

/** One recently-used map: reading an entry re-inserts it, so eviction takes
 *  the entry nothing has asked for in the longest time. */
function lru<Value>(cap: number): (key: string, build: () => Value) => Value {
  const held = new Map<string, Value>()
  return (key, build) => {
    const hit = held.get(key)
    if (hit !== undefined) {
      held.delete(key)
      held.set(key, hit)
      return hit
    }
    const made = build()
    held.set(key, made)
    if (held.size > cap) held.delete(held.keys().next().value as string)
    return made
  }
}

const parsedText = lru<MarkdownNode[]>(400)
const parsedInline = lru<InlineSegment[]>(512)
const segmented = new WeakMap<MarkdownNode[], MarkdownNode[][]>()
const sourceOf = new WeakMap<MarkdownNode[], string>()

/** `parseMarkdown`, remembered by text. Returns the same array for the same
 *  text, which is what lets the by-identity caches below land too. */
export function parseMarkdownCached(text: string): MarkdownNode[] {
  return parsedText(text, () => parseMarkdown(text))
}

/** `parseInline`, remembered by text — for the thought stream, whose stable
 *  paragraphs used to re-parse on every arriving delta. */
export function parseInlineCached(text: string): InlineSegment[] {
  return parsedInline(text, () => parseInline(text))
}

/** `segmentsOf`, remembered by the identity of its nodes. Pairs with
 *  `parseMarkdownCached`: cached text gives cached nodes gives cached
 *  segments, and the whole chain answers without allocating. */
export function segmentsOfCached(nodes: MarkdownNode[]): MarkdownNode[][] {
  const hit = segmented.get(nodes)
  if (hit) return hit
  const made = segmentsOf(nodes)
  segmented.set(nodes, made)
  return made
}

/** `segmentText`, remembered by the identity of its segment. */
export function segmentTextCached(segment: MarkdownNode[]): string {
  const hit = sourceOf.get(segment)
  if (hit !== undefined) return hit
  const made = segmentText(segment)
  sourceOf.set(segment, made)
  return made
}
