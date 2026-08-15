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
    case 'timeout':
      return 'warn'
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
  if (row.status === 'timeout') return 'warn'
  if (row.status === 'ok' && (row.kind === 'write' || row.kind === 'edit')) return 'accent'
  return 'muted'
}

/** Base colour for the right-aligned summary. */
export function metaTone(row: ToolRow): Tone {
  if (row.status === 'running') return 'muted'
  if (row.status === 'fail' || row.status === 'denied') return 'err'
  if (row.status === 'timeout') return 'warn'
  if (row.status === 'ok' && row.kind === 'bash') return 'ok'
  return 'dim'
}

export interface MetaSegment {
  text: string
  tone: Tone | null
}

/** Splits a summary so diff counters keep their own colours:
 *  "+14 −3" renders green then red, the rest inherits the row's meta tone. */
export function metaSegments(meta: string): MetaSegment[] {
  return meta.split(/(\s+)/).flatMap((part): MetaSegment[] => {
    if (part.trim() === '') return part === '' ? [] : [{ text: part, tone: null }]
    if (/^\+\S+$/.test(part)) return [{ text: part, tone: 'ok' }]
    if (/^[−-]\S+$/.test(part)) return [{ text: part, tone: 'err' }]
    return [{ text: part, tone: null }]
  })
}

export function isExpandable(row: ToolRow): boolean {
  return row.body !== undefined
}

export function chevron(open: boolean): string {
  return open ? '▾' : '▸'
}

/** Rows carry their own default expansion; unknown ids fall back to closed. */
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
  timeout: 'timed out',
  cancelled: 'cancelled',
  denied: 'denied',
  plain: '',
}
