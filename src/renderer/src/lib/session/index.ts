import { bridge } from '../bridge'
import { SessionClient } from './client'

// Narrowed once: inside a closure the nullable import cannot be refined.
const desktop = bridge

/** The renderer's single view of the session backend. In the browser harness
 *  it exists but has nothing behind it, so components degrade instead of
 *  throwing at import time. */
export const session = new SessionClient(desktop ? desktop.session.invoke : null)

if (desktop) {
  desktop.session.onEvents((batches) => session.ingest(batches))
}

export { SessionClient } from './client'
export type { ThreadListener } from './client'
