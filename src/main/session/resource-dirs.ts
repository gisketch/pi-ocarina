/** The three folders a resource can come from.
 *
 *  Separate from the session factory because this is a question about disk, not
 *  about constructing a session, and the factory was at its line limit saying
 *  so. A reader deciding whether to trust a skill wants to know which of these
 *  it came out of. */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sdk } from './workspaces'

/** How far up to look for the shipped resources folder.
 *
 *  Enough to cross `src/main/session` in development and `out/main` in a build,
 *  and not so far that a missing folder is answered by something in the user's
 *  home directory. */
const SEARCH_DEPTH = 6

function findShipped(): string {
  let at = dirname(fileURLToPath(import.meta.url))
  for (let up = 0; up <= SEARCH_DEPTH; up += 1) {
    const candidate = join(at, 'resources')
    if (existsSync(join(candidate, 'skills'))) return candidate
    const above = dirname(at)
    if (above === at) break
    at = above
  }
  // Nothing found. The empty string is a path that matches no file, which is
  // what a build shipping no resources should behave like: the skill is simply
  // absent, and nothing else breaks.
  return ''
}

/** Where this app keeps resources it ships — skills today.
 *
 *  Found by walking up from this module rather than from `process.cwd()`, which
 *  in a packaged app is wherever the reader happened to launch from. Resolved
 *  once: the folder does not move while the app runs. */
export const SHIPPED_RESOURCES = findShipped()

/** The skills this app ships, as a path pi's loader can be pointed at.
 *
 *  Empty when the folder was not found, and an empty list is what pi is handed
 *  then — a loader given a path that does not exist reports a diagnostic the
 *  reader can do nothing about. */
export function shippedSkillPaths(): string[] {
  if (SHIPPED_RESOURCES === '') return []
  const skills = join(SHIPPED_RESOURCES, 'skills')
  return existsSync(skills) ? [skills] : []
}

/** pi's own configuration folder. Read so the screen can tell a skill the
 *  reader installed from one the repository shipped. Never written to: it
 *  belongs to pi, and a file this app dropped there would be a skill its owner
 *  did not write and cannot trace. */
export function agentDirOf(sdk: Sdk): string {
  return sdk.getAgentDir()
}
