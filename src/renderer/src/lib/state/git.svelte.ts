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
/** How long `settled` waits for a first answer.
 *
 *  Long enough for a `git status` on a large repository, short enough that a
 *  backend which is never going to answer does not hold a keystroke. */
const FIRST_READ_MS = 2000

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

  /** Whether main has said anything about this workspace yet.
   *
   *  `git === null` on a workspace means two opposite things — a folder that is
   *  not a repository, and a repository nobody has read yet — and a caller that
   *  cannot tell them apart will treat a fresh repository as a plain folder. */
  answered(workspaceId: string): boolean {
    return answered.has(workspaceId)
  }

  /** Waits for that first answer, asking for it if nothing has.
   *
   *  Resolves as soon as one arrives, and gives up after `FIRST_READ_MS` with
   *  whatever the workspace currently says — a wrong guess after two seconds is
   *  better than a keystroke that never does anything. Without a bridge there is
   *  nobody to answer, so the demo statuses are the answer. */
  async settled(workspaceId: string): Promise<void> {
    if (!bridge || this.answered(workspaceId)) return

    this.refresh(workspaceId)
    const until = Date.now() + FIRST_READ_MS
    while (!this.answered(workspaceId) && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
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

/** Workspaces main has answered about, whatever the answer was. */
const answered = new Set<string>()

/** Writes one workspace's state, leaving the others' identities alone so only
 *  the column that changed re-renders. */
function apply(workspaceId: string, status: GitStatus | null): void {
  answered.add(workspaceId)
  let changed = false
  const next: Workspace[] = catalog.workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) return workspace
    // A push that says what the workspace already says is not a change, and
    // reassigning the array for it would wake every reader of the catalog per
    // `.git` write during a build or rebase. Statuses are a handful of fields,
    // so the structural compare is by serialization.
    if (JSON.stringify(workspace.git) === JSON.stringify(status)) return workspace
    changed = true
    return { ...workspace, git: status }
  })

  if (changed) catalog.workspaces = next
}

export const git = new Git()
