/** What each `/` command does.
 *
 *  Held outside the composer because none of it is about the text field: the
 *  composer decides that a command was named, and this decides what naming it
 *  means. Two of the four are handed back to the shell, which owns the
 *  overlays they open. */

import type { SlashCommand } from '../slash'
import { projectSurface } from './project-surface.svelte'
import { sweep } from './sweep.svelte'
import { threads } from './threads.svelte'

export interface SlashHandlers {
  threadId: string
  onmodel?: () => void
  oncommit?: () => void
}

export function runSlash(command: SlashCommand, { threadId, onmodel, oncommit }: SlashHandlers): void {
  // A project command is a prompt template. pi expands it, so the app sends the
  // text it was named by and invents no argument syntax of its own.
  if (command.id === 'project') threads.prompt(threadId, command.prompt ?? command.name)
  else if (command.id === 'compact') threads.compact(threadId)
  else if (command.id === 'model') onmodel?.()
  else if (command.id === 'commit') oncommit?.()
  else if (command.id === 'worktrees') void sweep.show()
  else if (command.id === 'reload') void projectSurface.reload()
}
