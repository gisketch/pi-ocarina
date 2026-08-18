/** The three folders a resource can come from.
 *
 *  Separate from the session factory because this is a question about disk, not
 *  about constructing a session, and the factory was at its line limit saying
 *  so. A reader deciding whether to trust a skill wants to know which of these
 *  it came out of. */

import { fileURLToPath } from 'node:url'
import type { Sdk } from './workspaces'

/** Where this app keeps resources it ships — skills today.
 *
 *  Resolved from this module rather than from `process.cwd()`, which in a
 *  packaged app is wherever the reader happened to launch from. */
export const SHIPPED_RESOURCES = fileURLToPath(new URL('../../../resources', import.meta.url))

/** pi's own configuration folder. Read so the screen can tell a skill the
 *  reader installed from one the repository shipped. Never written to: it
 *  belongs to pi, and a file this app dropped there would be a skill its owner
 *  did not write and cannot trace. */
export function agentDirOf(sdk: Sdk): string {
  return sdk.getAgentDir()
}
