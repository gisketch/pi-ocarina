import type { GitStatus } from '../../../../shared/protocol'
import { bridge } from '../bridge'
import type { Workspace } from '../types'
import { catalog } from './catalog.svelte'

/** The renderer's half of the git pipeline.
 *
 *  Nothing polls. Main pushes a workspace's state when something under `.git`
 *  changes; this side asks for a re-read at the two moments main cannot see —
 *  when the user looks at a workspace, and when the agent finishes a tool call
 *  that may have edited files without touching `.git` at all.
 *
 *  Every method is a no-op without a bridge, so the browser harness keeps the
 *  demo statuses it started with. */
class Git {
  #started = false

  /** Starts listening and asks about every pinned workspace once. Safe to call
   *  again after a pin: asking about a workspace already known costs one git
   *  run and publishes nothing when the answer has not changed. */
  start(): () => void {
    const desktop = bridge
    if (!desktop) return () => {}

    const stop = desktop.git.onStatus(({ workspaceId, status }) => {
      apply(workspaceId, status)
    })

    if (!this.#started) {
      this.#started = true
      // A window that opened after main had already read a repository would
      // otherwise show no branch until the next write under `.git`.
      void desktop.git
        .statuses()
        .then((known) => {
          for (const { workspaceId, status } of known) apply(workspaceId, status)
        })
        .catch(() => undefined)
    }

    return stop
  }

  refresh(workspaceId: string): void {
    if (workspaceId) bridge?.git.refresh(workspaceId)
  }

  /** Re-reads the repository a thread belongs to. What an agent's finished
   *  tool call means: files may have changed with nothing written under
   *  `.git`, which no watcher can see. */
  refreshForThread(threadId: string): void {
    if (!bridge) return
    const owner = catalog.workspaces.find((workspace) =>
      workspace.threads.some((thread) => thread.id === threadId),
    )
    if (owner) this.refresh(owner.id)
  }
}

/** Writes one workspace's state, leaving the others' identities alone so only
 *  the column that changed re-renders. */
function apply(workspaceId: string, status: GitStatus | null): void {
  let changed = false
  const next: Workspace[] = catalog.workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) return workspace
    changed = true
    return { ...workspace, git: status }
  })

  if (changed) catalog.workspaces = next
}

export const git = new Git()
