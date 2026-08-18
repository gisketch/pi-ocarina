/** What each `/` command does.
 *
 *  Held outside the composer because none of it is about the text field: the
 *  composer decides that a command was named, and this decides what naming it
 *  means. Two of the four are handed back to the shell, which owns the
 *  overlays they open. */

import type { SlashCommand } from '../slash'
import type { ThreadId } from '../../../../shared/thread-id'
import { reloadEverything } from './reload'
import { sweep } from './sweep.svelte'
import { threads } from './threads.svelte'

export interface SlashHandlers {
  /** The thread the command runs in, or null over a column that has none —
   *  the placeholder. */
  threadId: ThreadId | null
  /** The thread to send to, creating one if this column has none. The same
   *  function typed prose uses: a project command is a prompt, so naming one
   *  from the hero column brings a thread into existence exactly as sending a
   *  sentence does. */
  targetThread: () => Promise<ThreadId | null>
  onmodel?: () => void
  oncommit?: () => void
}

export function runSlash(
  command: SlashCommand,
  { threadId, targetThread, onmodel, oncommit }: SlashHandlers,
): void {
  // A project command is a prompt template. pi expands it, so the app sends the
  // text it was named by and invents no argument syntax of its own.
  // A skill and a project command are the same act: text pi expands before the
  // model reads it. Both create the thread first when the column has none, the
  // way typed prose does.
  if (command.id === 'project' || command.id === 'skill') {
    void targetThread().then((id) => {
      if (id) threads.prompt(id, command.prompt ?? command.name)
    })
  } else if (command.id === 'compact') {
    // Nothing to summarise without a transcript; the menu does not offer it
    // there, and this is the same answer said twice.
    if (threadId) threads.compact(threadId)
  } else if (command.id === 'model') onmodel?.()
  else if (command.id === 'commit') oncommit?.()
  else if (command.id === 'worktrees') void sweep.show()
  else if (command.id === 'reload') void reloadEverything()
}
