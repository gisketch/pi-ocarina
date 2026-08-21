import type { IconName } from './icons'
import type { ToolRow, ToolStatus } from './thread'

/** Semantic tone names; components map these to tokens. */
export type Tone = 'accent' | 'ok' | 'err' | 'warn' | 'dim' | 'muted'

/** Colour of the spine node beside a row. */
export function nodeTone(row: ToolRow): Tone {
  switch (row.status) {
    case 'running':
      return 'accent'
    case 'fail':
    case 'denied':
      return 'err'
    case 'ok':
      // Writes and edits stay accent; completed commands go green.
      return row.kind === 'write' || row.kind === 'edit' ? 'accent' : 'ok'
    case 'cancelled':
      return 'dim'
    default:
      return row.kind === 'skill' || row.kind === 'agent' ? 'accent' : 'muted'
  }
}

/** Colour of the fixed-width kind label ("read", "bash", …). */
export function labelTone(row: ToolRow): Tone {
  if (row.status === 'running') return 'accent'
  if (row.status === 'fail' || row.status === 'denied') return 'err'
  if (row.status === 'ok' && (row.kind === 'write' || row.kind === 'edit')) return 'accent'
  // A diagnostics call that found errors *succeeded* — the tool did its job —
  // so its status says nothing about what it found. The mockup colours the
  // gutter word, which is the one part of the row that is not already
  // carrying the count.
  if (row.kind === 'lsp' && /\d+ errors?\b/.test(row.meta ?? '')) return 'err'
  return 'muted'
}

/** Base colour for the right-aligned summary. */
export function metaTone(row: ToolRow): Tone {
  if (row.status === 'running') return 'muted'
  if (row.status === 'fail' || row.status === 'denied') return 'err'
  if (row.status === 'ok' && row.kind === 'bash') return 'ok'
  return 'dim'
}

export interface MetaSegment {
  text: string
  tone: Tone | null
}

/** A count and the word it counts, which belong to one another.
 *
 *  Matched before the summary is split on whitespace: `2 errors` is one fact
 *  and colouring only the digit would read as a stray red `2`. */
const PROBLEMS = /\b(\d+)\s+(errors?|warns?|warnings?)\b/g

/** Splits a summary so its counters keep their own colours: "+14 −3" renders
 *  green then red, "2 errors 5 warns" red then yellow, and the rest inherits
 *  the row's meta tone. */
export function metaSegments(meta: string): MetaSegment[] {
  const segments: MetaSegment[] = []
  let at = 0

  PROBLEMS.lastIndex = 0
  for (let match = PROBLEMS.exec(meta); match; match = PROBLEMS.exec(meta)) {
    if (match.index > at) segments.push(...plainSegments(meta.slice(at, match.index)))
    segments.push({ text: match[0], tone: match[2].startsWith('error') ? 'err' : 'warn' })
    at = match.index + match[0].length
  }
  if (at < meta.length) segments.push(...plainSegments(meta.slice(at)))
  return segments
}

function plainSegments(text: string): MetaSegment[] {
  return text.split(/(\s+)/).flatMap((part): MetaSegment[] => {
    if (part.trim() === '') return part === '' ? [] : [{ text: part, tone: null }]
    if (/^\+\S+$/.test(part)) return [{ text: part, tone: 'ok' }]
    if (/^[−-]\S+$/.test(part)) return [{ text: part, tone: 'err' }]
    return [{ text: part, tone: null }]
  })
}

export function isExpandable(row: ToolRow): boolean {
  // A thought draws its full text as prose (turn-accordion spec) — there is
  // nothing left under it to expand.
  return row.body !== undefined && row.kind !== 'think'
}

/** Which chevron a row wears. An icon name rather than a character: the two
 *  triangles differed by platform font, and one of them was a different weight
 *  from the other on every machine that had to substitute it. */
export function chevron(open: boolean): IconName {
  return open ? 'chevron-down' : 'chevron-right'
}

/** Rows carry their own default expansion; unknown ids fall back to closed. */
/** How many lines of a diff a row draws before it defers to the viewer.
 *
 *  Enough for the edits an agent actually makes — the reference's examples are
 *  three lines — and short of a row that takes the column. What is left is
 *  stated, never silently dropped. */
export const DRAWN_DIFF_LINES = 24

export function initialOpenState(rows: ToolRow[]): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const row of rows) {
    if (isExpandable(row)) state[row.id] = row.open ?? false
    for (const child of row.children ?? []) {
      if (isExpandable(child)) state[child.id] = child.open ?? false
    }
  }
  return state
}

export const STATUS_LABEL: Record<ToolStatus, string> = {
  running: 'running',
  ok: 'ok',
  fail: 'failed',
  cancelled: 'cancelled',
  denied: 'denied',
  plain: '',
}
