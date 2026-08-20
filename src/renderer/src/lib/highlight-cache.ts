/** The incremental face of the block highlighter.
 *
 *  A streaming fence grows by a few lines per batch, and re-tokenizing the
 *  whole block per batch made the cost of one arriving token proportional to
 *  everything above it. `highlight.ts` was built line-by-line precisely so a
 *  new line could be coloured alone — this module is the caller that finally
 *  uses that: it remembers each block's tokenized lines with the carry state
 *  every line ended in, finds how much of the new text it has already seen,
 *  and colours only from the first line that differs.
 *
 *  Blocks are recognised by content, not by caller identity: a fence being
 *  streamed has no stable id — its node is rebuilt every batch — but its
 *  earlier lines are its fingerprint. A collision costs a recompute, never a
 *  wrong colour: reuse is always from a verbatim shared line prefix, and the
 *  carry state is re-threaded from exactly there. */

import { CLEAN, highlightLine, type LineState, type Token } from './highlight'

interface Entry {
  lang: string
  src: string[]
  lines: Token[][]
  /** State after line i — what line i+1 starts in. */
  ends: LineState[]
}

/** Enough for every fence and code body on screen at once; oldest falls off. */
const CAP = 48
const entries: Entry[] = []

/** `highlightBlock`, remembered and incremental.
 *
 *  Returns the same tokens array for unchanged text, so a keyed `{#each}`
 *  over it re-renders nothing. */
export function highlightBlockCached(text: string, lang: string): Token[][] {
  const src = text.split('\n')

  // The entry that already knows the longest prefix of this block. Most
  // entries fail on their first line, so the scan is cheap in practice.
  let best: Entry | null = null
  let shared = 0
  for (const entry of entries) {
    if (entry.lang !== lang) continue
    const cap = Math.min(entry.src.length, src.length)
    let at = 0
    while (at < cap && entry.src[at] === src[at]) at += 1
    if (at > shared) {
      shared = at
      best = entry
    }
  }

  if (best && shared === src.length && best.src.length === src.length) {
    touch(best)
    return best.lines
  }

  const lines: Token[][] = best ? best.lines.slice(0, shared) : []
  const ends: LineState[] = best ? best.ends.slice(0, shared) : []
  let state: LineState = shared > 0 ? ends[shared - 1] : CLEAN
  for (let at = shared; at < src.length; at += 1) {
    const { tokens, to } = highlightLine(src[at], lang, state)
    lines.push(tokens)
    ends.push(to)
    state = to
  }

  // The grown block replaces the entry it grew from: keeping both would let
  // every batch of one stream take a cache slot from every other block.
  if (best && shared > 0) {
    best.src = src
    best.lines = lines
    best.ends = ends
    touch(best)
  } else {
    entries.push({ lang, src, lines, ends })
    if (entries.length > CAP) entries.shift()
  }

  return lines
}

function touch(entry: Entry): void {
  const at = entries.indexOf(entry)
  if (at !== -1) {
    entries.splice(at, 1)
    entries.push(entry)
  }
}
