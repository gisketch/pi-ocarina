import type { EventBatch } from '../../../../shared/protocol'
import { bridge } from '../bridge'
import { SessionClient } from './client'

// Narrowed once: inside a closure the nullable import cannot be refined.
const desktop = bridge

/** The renderer's single view of the session backend. In the browser harness
 *  it exists but has nothing behind it, so components degrade instead of
 *  throwing at import time. */
export const session = new SessionClient(desktop ? desktop.session.invoke : null)

if (desktop) {
  desktop.session.onEvents((batches) => {
    if (import.meta.env.DEV) tap(batches)
    session.ingest(batches)
  })
}

if (import.meta.env.DEV && desktop) {
  // Temporary dev hook: lets a real Electron run prove the whole IPC path
  // (renderer → preload → main → driver → batcher → renderer). Removed once
  // threads render the stream themselves.
  Object.assign(window, {
    __piocarinaSeamDemo: async (): Promise<{ threadId: string; kinds: string[] }> => {
      const { threadId } = await session.invoke('createThread', { workspaceId: 'demo' })
      const kinds: string[] = []
      session.subscribe(threadId, (events) => kinds.push(...events.map((event) => event.kind)))
      await session.invoke('prompt', { threadId, text: 'seam demo' })
      await new Promise((resolve) => setTimeout(resolve, 1200))
      return { threadId, kinds }
    },
  })
}

/** Temporary: makes the stub stream visible while the pi adapter is being
 *  built. Remove once threads render the stream themselves. */
function tap(batches: EventBatch[]): void {
  for (const batch of batches) {
    const kinds = batch.events.map((event) => event.kind).join(', ')
    console.debug(`[session] ${batch.threadId} #${batch.from} — ${kinds}`)
  }
}

export { SessionClient } from './client'
export type { ThreadListener } from './client'
