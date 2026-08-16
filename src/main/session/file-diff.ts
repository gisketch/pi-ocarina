/** The diff between two versions of a file.
 *
 *  Pure, and deliberately so: it takes two strings and returns lines. The file
 *  system, git, and pi all stay outside, which is what lets the hard part —
 *  which lines correspond — be tested as arithmetic.
 *
 *  Not a git diff. The change under review is what one tool call did, and git
 *  cannot answer that: it only knows the working tree against a commit, so a
 *  file edited twice would report both edits every time. */

import type { DiffLine } from '../../shared/vocabulary'

/** Lines of unchanged text kept around a change, so a reader can see where in
 *  the file they are. Three is what every diff tool settled on. */
const CONTEXT = 3

/** Above this, a file is not diffed line by line.
 *
 *  A minified bundle is one line of half a megabyte, and a generated lockfile is
 *  fifty thousand short ones. Neither is a thing a person reads, and the
 *  quadratic below would stall the main process on both. */
const MAX_BYTES = 400_000

/** Above this many differing lines, the two versions are reported as a
 *  replacement rather than matched line by line. The matching below is
 *  quadratic in this number. */
const MAX_MATCHED = 1500

/** A file's lines.
 *
 *  The trailing empty string a final newline produces is dropped: it is an
 *  artifact of splitting, not a line anyone wrote, and drawing it puts a blank
 *  row at the end of most diffs. Whether that newline exists is still a real
 *  difference, so `diffLines` reports it separately rather than losing it. */
function split(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** How many lines the two versions share at the start and at the end.
 *
 *  Almost every edit is a small change in a large file, and both ends are
 *  usually identical. Trimming them is what keeps the matching below cheap
 *  enough to run on every tool call. */
function ends(before: string[], after: string[]): { head: number; tail: number } {
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1

  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1
  }

  return { head, tail }
}

type Op = { kind: ' ' | '-' | '+'; text: string }

/** Which lines correspond, by longest common subsequence.
 *
 *  The table is the classic one. It is only ever given the middle of a file —
 *  the part that actually differs — because `ends` has already taken the
 *  matching head and tail off both sides. */
function match(before: string[], after: string[]): Op[] {
  const rows = before.length
  const cols = after.length

  // One row of the table per line, holding the length of the best match so far.
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0))
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] =
        before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      ops.push({ kind: ' ', text: before[i] })
      i += 1
      j += 1
      continue
    }
    // A deletion first when both are possible, so a replaced line reads as
    // "was this, now that" rather than the other way round.
    if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: '-', text: before[i] })
      i += 1
    } else {
      ops.push({ kind: '+', text: after[j] })
      j += 1
    }
  }
  while (i < rows) {
    ops.push({ kind: '-', text: before[i] })
    i += 1
  }
  while (j < cols) {
    ops.push({ kind: '+', text: after[j] })
    j += 1
  }

  return ops
}

/** Everything, in order, as operations — before the context is trimmed. */
function operations(before: string[], after: string[]): Op[] {
  const { head, tail } = ends(before, after)
  const mid = {
    before: before.slice(head, before.length - tail),
    after: after.slice(head, after.length - tail),
  }

  const middle =
    mid.before.length + mid.after.length > MAX_MATCHED
      ? // Too large to match line by line. Reporting it as a wholesale
        // replacement is honest: it says every line differs, which is true,
        // rather than guessing at correspondences nobody would read anyway.
        [
          ...mid.before.map((text): Op => ({ kind: '-', text })),
          ...mid.after.map((text): Op => ({ kind: '+', text })),
        ]
      : match(mid.before, mid.after)

  return [
    ...before.slice(0, head).map((text): Op => ({ kind: ' ', text })),
    ...middle,
    ...before.slice(before.length - tail).map((text): Op => ({ kind: ' ', text })),
  ]
}

/** Which operations are near enough to a change to be worth drawing. */
function kept(ops: Op[]): boolean[] {
  const keep = ops.map((op) => op.kind !== ' ')

  for (let at = 0; at < ops.length; at += 1) {
    if (ops[at].kind === ' ') continue
    for (let near = Math.max(0, at - CONTEXT); near <= Math.min(ops.length - 1, at + CONTEXT); near += 1) {
      keep[near] = true
    }
  }

  return keep
}

export interface DiffOptions {
  /** Reported in the `@` marker, and how a caller says "this file is new". */
  path?: string
}

/** The diff between two versions of a file, as lines a renderer can draw.
 *
 *  A `@` line marks a run of unchanged text that was skipped, so a reader can
 *  see that the file continues rather than believing the diff is the file. */
export function diffLines(before: string, after: string, options: DiffOptions = {}): DiffLine[] {
  if (before === after) return []

  if (before.length > MAX_BYTES || after.length > MAX_BYTES) {
    const name = options.path ?? 'the file'
    return [{ sign: '@', text: `${name} is too large to diff · ${bytes(before)} → ${bytes(after)}` }]
  }

  const ops = operations(split(before), split(after))
  const keep = kept(ops)
  // Two versions can differ only in their final newline, and then no line is
  // drawn at all. A "17 unchanged lines" marker with nothing to give context to
  // reads as though the diff failed.
  const changed = ops.some((op) => op.kind !== ' ')

  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  let skipped = 0

  const flushSkip = (): void => {
    if (skipped === 0 || !changed) return
    lines.push({ sign: '@', text: `⋯ ${skipped} unchanged ${skipped === 1 ? 'line' : 'lines'}` })
    skipped = 0
  }

  for (let at = 0; at < ops.length; at += 1) {
    const op = ops[at]
    if (op.kind !== '+') oldLine += 1
    if (op.kind !== '-') newLine += 1

    if (!keep[at]) {
      skipped += 1
      continue
    }

    flushSkip()
    lines.push({
      sign: op.kind,
      text: op.text,
      // A removed line's number is where it was; everything else is where it
      // now is. A reader jumping to the file wants the second one.
      line: op.kind === '-' ? oldLine : newLine,
    })
  }

  flushSkip()

  // Not a line, but a difference a reader would otherwise never see: the two
  // versions disagree about whether the file ends in a newline.
  if (before !== '' && after !== '' && before.endsWith('\n') !== after.endsWith('\n')) {
    lines.push({
      sign: '@',
      text: after.endsWith('\n') ? 'newline added at end of file' : 'no newline at end of file',
    })
  }

  return lines
}

const bytes = (text: string): string =>
  text.length > 1_000_000
    ? `${Math.round(text.length / 100_000) / 10}MB`
    : `${Math.round(text.length / 1024)}kB`

/** What the row's right-hand summary says: `+14 −3`, or `new file`. */
export function countChanges(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.sign === '+') added += 1
    if (line.sign === '-') removed += 1
  }
  return { added, removed }
}
