/** Splitting the composer's text into the runs a mirror draws.
 *
 *  The composer stays a real `<textarea>` — native editing, native undo, native
 *  input methods. Chips come from a mirror behind it drawing the same string,
 *  with the textarea's own text transparent on top.
 *
 *  The rule that makes that safe: **the mirror decorates, it never re-flows.**
 *  A chip is painted with colour and an outline, never padding or a border, so
 *  every glyph stays exactly where the textarea put it. `@src/app.ts` is
 *  thirteen characters in both, in the same place, in the same font — so the
 *  caret cannot drift, and selection covers what it appears to. */

import type { Fold } from './paste'
import { skillSpans } from './slash'

/** How many characters at the front of a chip the mark stands on. Those
 *  characters keep their place in the flow and give up only their ink — which
 *  is the only way a mirror that may not occupy space can have a mark at all. */
export type Segment =
  | { kind: 'plain'; text: string }
  | { kind: 'mention'; text: string; lead: number }
  | { kind: 'fold'; text: string; lead: number }
  /** A file staged for this message, named in the text. Drawn as a chip in
   *  the flow of the sentence, which is where the reader put it — a row of
   *  chips above the composer is a second place to look and a second thing to
   *  keep in sync with what was typed. */
  | { kind: 'file'; text: string; lead: number }
  /** A skill the reader named. `skillsSaid` writes it as pi's `/skill:name` on
   *  the way out; the chip is so the sentence reads as the reader meant it
   *  rather than as a namespace they never typed. */
  | { kind: 'skill'; text: string; lead: number }

/** A mention: an `@` at the start or after whitespace, whose text has the
 *  shape of a path.
 *
 *  The shape rule is the transcript's, deliberately: this decorated anything
 *  after an `@`, so `@alice` was a chip while it was typed and plain text the
 *  moment it was sent. One rule, one appearance. */
const MENTION = /(^|\s)(@[^\s@]*[./][^\s]*)/g

/** One chip's place in the text, and how many characters at its front the
 *  mark may stand on. Zero is honest: a chip at position 0 with no sigil has
 *  no cell to spare, and hiding a character of its *name* instead is how
 *  `pasted-1.png` became `asted-1.png`. */
interface Span {
  start: number
  end: number
  lead: number
}

/** Where each fold's token sits in the text. Its `[` is the mark's cell. */
function foldSpans(text: string, folds: readonly Fold[]): Span[] {
  const spans: Span[] = []

  for (const fold of folds) {
    let from = 0
    for (;;) {
      const at = text.indexOf(fold.token, from)
      if (at === -1) break
      spans.push({ start: at, end: at + fold.token.length, lead: 1 })
      from = at + fold.token.length
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

/** Where each staged file's name sits in the text.
 *
 *  Longest first, so `shot.old.png` is not shadowed by `shot.old`. */
function fileSpans(text: string, files: readonly string[]): Span[] {
  const spans: Span[] = []

  for (const name of [...files].sort((a, b) => b.length - a.length)) {
    if (name === '') continue
    let from = 0
    for (;;) {
      const at = text.indexOf(name, from)
      if (at === -1) break
      // The spaces in front come with it — a file name has no sigil of its
      // own, so spaces are the only cells its mark can stand on. Up to two,
      // for a full-size mark; and when the run of spaces borders something
      // else, one is always left unclaimed, because that plain cell is the
      // visible gap between this chip and whatever sits before it. At
      // position 0 with no spaces the honest answer is a chip with no mark,
      // never one that eats the first letter of the name.
      let spaces = 0
      while (spaces < 3 && at - 1 - spaces >= 0 && text[at - 1 - spaces] === ' ') spaces += 1
      const fromStart = at - spaces === 0
      const lead =
        spaces === 0 ? 0 : spaces === 1 ? 1 : fromStart ? Math.min(2, spaces) : Math.min(2, spaces - 1)
      spans.push({ start: at - lead, end: at + name.length, lead })
      from = at + name.length
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

function mentionSpans(text: string): Span[] {
  const spans: Span[] = []
  MENTION.lastIndex = 0

  for (;;) {
    const match = MENTION.exec(text)
    if (!match) break
    // The whitespace in front comes with the chip, so the mark has a cell of
    // its own and the `@` becomes the gap before the name. At the very start
    // there is no whitespace and the `@` alone carries a smaller mark.
    const start = match.index
    spans.push({ start, end: start + match[1].length + match[2].length, lead: match[1].length + 1 })
  }
  return spans
}

/** The text as plain runs and chips, in order.
 *
 *  Every character of the input appears in exactly one segment, in order —
 *  that property is what the mirror's alignment rests on, and what the tests
 *  check first. */
export function segment(
  text: string,
  folds: readonly Fold[] = [],
  files: readonly string[] = [],
  skills: readonly string[] = [],
): Segment[] {
  const marks: (Span & { kind: 'mention' | 'fold' | 'file' | 'skill' })[] = [
    ...foldSpans(text, folds).map((span) => ({ ...span, kind: 'fold' as const })),
    ...mentionSpans(text).map((span) => ({ ...span, kind: 'mention' as const })),
    ...fileSpans(text, files).map((span) => ({ ...span, kind: 'file' as const })),
    ...skillSpans(text, skills).map((span) => ({
      // Back over the whitespace in front, so the chip owns a cell for its
      // mark and the `/` after it becomes the gap before the name.
      start: span.start - span.lead,
      end: span.end,
      kind: 'skill' as const,
      lead: span.lead + 1,
    })),
  ].sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let at = 0

  for (const mark of marks) {
    // A fold's token contains no whitespace-preceded `@` in practice, but if a
    // reader pasted one the two spans could overlap. The first wins; the second
    // is dropped rather than allowed to duplicate the characters.
    if (mark.start < at) continue
    if (mark.start > at) segments.push({ kind: 'plain', text: text.slice(at, mark.start) })
    segments.push({ kind: mark.kind, text: text.slice(mark.start, mark.end), lead: mark.lead })
    at = mark.end
  }

  if (at < text.length) segments.push({ kind: 'plain', text: text.slice(at) })
  return segments
}
