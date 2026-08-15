import type { Block } from '../../thread'
import { FLAKY_E2E, QUEUE_REFACTOR, RETRY_BACKOFF } from './pi-core'
import { ICON_AUDIT, PALETTE_FLICKER } from './ocarina-ui'

/** Thread id → blocks. Threads absent here render empty (the fresh-thread hero
 *  is handled by the strip, not by this map). */
export const THREAD_BLOCKS: Record<string, Block[]> = {
  'retry-backoff': RETRY_BACKOFF,
  'flaky-e2e': FLAKY_E2E,
  'queue-refactor': QUEUE_REFACTOR,
  'palette-flicker': PALETTE_FLICKER,
  'icon-audit': ICON_AUDIT,
}

export function blocksFor(threadId: string): Block[] {
  return THREAD_BLOCKS[threadId] ?? []
}
