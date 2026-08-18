/** What `/reload` re-reads.
 *
 *  Two files, one command. A reader who edited a skill and a keybinding should
 *  not have to remember which door each one goes through, and "re-read what is
 *  on disk" is one idea.
 *
 *  The thread's resources go first because that is the half that can be
 *  refused: pi builds the system prompt per request, so a reload landing
 *  mid-turn would leave the next turn running under different instructions than
 *  the last. When it is refused, nothing is re-read — a half-applied reload is
 *  worse than none, because the reader would be told it worked. */

import { config } from './config.svelte'
import { projectSurface } from './project-surface.svelte'

export async function reloadEverything(): Promise<void> {
  const reloaded = await projectSurface.reload()
  if (reloaded) await config.reload()
}
