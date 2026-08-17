/** What each `/` command does.
 *
 *  Held outside the composer because none of it is about the text field: the
 *  composer decides that a command was named, and this decides what naming it
 *  means. Two of the four are handed back to the shell, which owns the
 *  overlays they open. */

import type { SlashCommand } from '../slash'
import { sweep } from './sweep.svelte'
import { threads } from './threads.svelte'

export interface SlashHandlers {
  threadId: string
  onmodel?: () => void
  oncommit?: () => void
}

export function runSlash(command: SlashCommand, { threadId, onmodel, oncommit }: SlashHandlers): void {
  if (command.id === 'compact') threads.compact(threadId)
  else if (command.id === 'model') onmodel?.()
  else if (command.id === 'commit') oncommit?.()
  else if (command.id === 'worktrees') void sweep.show()
}
