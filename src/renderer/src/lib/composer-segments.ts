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

export type Segment =
  | { kind: 'plain'; text: string }
  | { kind: 'mention'; text: string }
  | { kind: 'fold'; text: string }

/** A mention: an `@` at the start or after whitespace, up to the next space.
 *  The same rule `mentionAt` applies, so what the picker inserts is what the
 *  mirror decorates. */
const MENTION = /(^|\s)(@[^\s]+)/g

/** Where each fold's token sits in the text. */
function foldSpans(text: string, folds: readonly Fold[]): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []

  for (const fold of folds) {
    let from = 0
    for (;;) {
      const at = text.indexOf(fold.token, from)
      if (at === -1) break
      spans.push({ start: at, end: at + fold.token.length })
      from = at + fold.token.length
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

function mentionSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []
  MENTION.lastIndex = 0

  for (;;) {
    const match = MENTION.exec(text)
    if (!match) break
    const start = match.index + match[1].length
    spans.push({ start, end: start + match[2].length })
  }
  return spans
}

/** The text as plain runs and chips, in order.
 *
 *  Every character of the input appears in exactly one segment, in order —
 *  that property is what the mirror's alignment rests on, and what the tests
 *  check first. */
export function segment(text: string, folds: readonly Fold[] = []): Segment[] {
  const marks: { start: number; end: number; kind: 'mention' | 'fold' }[] = [
    ...foldSpans(text, folds).map((span) => ({ ...span, kind: 'fold' as const })),
    ...mentionSpans(text).map((span) => ({ ...span, kind: 'mention' as const })),
  ].sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let at = 0

  for (const mark of marks) {
    // A fold's token contains no whitespace-preceded `@` in practice, but if a
    // reader pasted one the two spans could overlap. The first wins; the second
    // is dropped rather than allowed to duplicate the characters.
    if (mark.start < at) continue
    if (mark.start > at) segments.push({ kind: 'plain', text: text.slice(at, mark.start) })
    segments.push({ kind: mark.kind, text: text.slice(mark.start, mark.end) })
    at = mark.end
  }

  if (at < text.length) segments.push({ kind: 'plain', text: text.slice(at) })
  return segments
}
