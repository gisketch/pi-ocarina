import type { Block, ToolRow } from '../../thread'
import { replayThread } from '../../thread-reducer'
import { FLAKY_E2E, QUEUE_REFACTOR, RETRY_BACKOFF } from './pi-core'
import { ICON_AUDIT, PALETTE_FLICKER } from './ocarina-ui'
import { FAN_OUT } from './subagents'
import type { MockThread } from './types'

export type { MockThread } from './types'

/** Thread id → recorded stream. Threads absent here render empty (the
 *  fresh-thread hero is handled by the strip, not by this map). */
export const MOCK_THREADS: Record<string, MockThread> = {
  'retry-backoff': RETRY_BACKOFF,
  'flaky-e2e': FLAKY_E2E,
  'queue-refactor': QUEUE_REFACTOR,
  'palette-flicker': PALETTE_FLICKER,
  'icon-audit': ICON_AUDIT,
  'fan-out': FAN_OUT,
}

/** Projects a mock thread the same way a live one is projected. */
export function blocksFor(threadId: string): Block[] {
  const thread = MOCK_THREADS[threadId]
  if (!thread) return []

  return expand(replayThread(thread.events).blocks, new Set(thread.open ?? []))
}

/** Re-applies the reference's default expansions after projection. */
function expand(blocks: Block[], open: Set<string>): Block[] {
  if (open.size === 0) return blocks

  return blocks.map((block) =>
    block.kind === 'ledger' ? { ...block, rows: block.rows.map((row) => mark(row, open)) } : block,
  )
}

function mark(row: ToolRow, open: Set<string>): ToolRow {
  const children = row.children?.map((child) => mark(child, open))
  return { ...row, open: open.has(row.id) || row.open, children }
}
