/** The worktree question, asked on the dashboard instead of over it.
 *
 *  This replaced the WorktreeAsk modal. The dashboard already is the place a
 *  thread is chosen, so the branch name is a state of the column rather than
 *  a dialog on top of everything — `b` swaps the launcher's menu for a field,
 *  and `esc` swaps it back.
 *
 *  It still owns the making of the thread, for the modal's old reason:
 *  `git worktree add` is slow enough to need a pending state, and a failure
 *  needs somewhere to be read — the field the name was typed in is the only
 *  place that can both say why and let the reader fix it.
 *
 *  Keys arrive through `routeToOverlay`, like every surface that reads raw
 *  letters: the field is drawn as state, not as a DOM input, so the whole
 *  flow is testable without a document. */

import { validateBranchName, worktreeDirName } from '../../../../shared/branch-name'
import { MODIFIER_KEYS } from '../keyboard-types'
import { session } from '../session'
import { catalog } from './catalog.svelte'

class BranchField {
  /** The dashboard column showing the field, or null when no field is up. */
  columnId = $state<string | null>(null)
  branch = $state('')
  /** True while git makes the worktree. The field is the pending state. */
  creating = $state(false)
  /** What the backend said when the last attempt failed. */
  failure = $state<string | null>(null)
  /** Branches and directories this workspace's worktrees already use, read
   *  when the field opens so a taken name is refused under the field rather
   *  than by git a round trip later. */
  #taken = $state.raw<string[]>([])
  #workspaceId: string | null = null

  /** The rule the typed name breaks, or null. Empty while nothing is typed:
   *  a field that turns red before it has been used is scolding, not helping. */
  get problem(): string | null {
    if (this.branch === '') return null
    if (this.#taken.includes(this.branch) || this.#taken.includes(worktreeDirName(this.branch))) {
      return 'that branch already exists'
    }
    return validateBranchName(this.branch)
  }

  /** Whether `enter` can take the branch. */
  get ready(): boolean {
    return this.branch !== '' && this.problem === null && !this.creating
  }

  open(workspaceId: string, columnId: string): void {
    this.#workspaceId = workspaceId
    this.columnId = columnId
    this.branch = ''
    this.creating = false
    this.failure = null
    this.#taken = []
    void this.#readTaken(workspaceId)
  }

  close(): void {
    this.columnId = null
    this.branch = ''
    this.creating = false
    this.failure = null
    this.#taken = []
    this.#workspaceId = null
  }

  /** The names this workspace has already used. A read that fails leaves the
   *  list empty: git refuses a duplicate anyway, and a field that would not
   *  let a legal name through because a listing failed is worse. */
  async #readTaken(workspaceId: string): Promise<void> {
    try {
      const { worktrees } = await session.invoke('listWorktrees', { workspaceId })
      if (this.columnId === null) return
      this.#taken = worktrees.flatMap((tree) => [tree.branch, worktreeDirName(tree.branch)])
    } catch {
      this.#taken = []
    }
  }

  /** Creates the worktree thread, holding the field up while git runs.
   *
   *  Success needs no navigation: the catalog replaces the dashboard column
   *  in place, so the reader is already looking at the thread they made. A
   *  failure keeps the field open — the name is the thing most likely to be
   *  wrong, and the reader is the only one who can pick another. */
  async submit(): Promise<void> {
    const workspaceId = this.#workspaceId
    if (!this.ready || workspaceId === null) return

    this.creating = true
    this.failure = null
    const branch = this.branch
    const threadId = await catalog.newThread(workspaceId, { branch })
    if (this.columnId === null) return

    if (threadId !== null) {
      this.close()
      return
    }
    this.creating = false
    this.failure = 'git would not make that worktree'
    this.#taken = [...this.#taken, branch]
  }

  /** One key while the field is up. Always consumed, except a bare modifier:
   *  reaching for a capital is not an answer. */
  handleKey(event: { key: string }): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false
    // While git runs there is nothing to type, and `esc` must not abandon a
    // checkout that is halfway made.
    if (this.creating) return true

    if (event.key === 'Escape') {
      // Back to the menu, not out of the column. A reader who mistyped a
      // name is not asking to lose the launcher.
      this.close()
      return true
    }
    if (event.key === 'Enter') {
      void this.submit()
      return true
    }
    if (event.key === 'Backspace') {
      this.branch = this.branch.slice(0, -1)
      return true
    }
    if (event.key.length === 1) {
      this.branch += event.key
      return true
    }
    return true
  }
}

export const branchField = new BranchField()
