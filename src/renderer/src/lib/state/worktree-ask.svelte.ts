/** The question every new thread asks in a repository: its own worktree?
 *
 *  Modal, and shaped like `confirm`: one question at a time, answered from the
 *  keyboard, resolving a promise the caller is waiting on. It ranks with the
 *  other modals rather than with the strip's bindings, because a key that fell
 *  through would move a column behind a question the reader is answering.
 *
 *  The default is no. A worktree is a real directory and a real branch, and a
 *  reader who pressed `enter` past a dialog they did not read should end up
 *  with the thread they have always had.
 *
 *  It also owns the making of the thread, rather than handing a branch name
 *  back and closing. `git worktree add` is slow enough to need a pending state,
 *  and a failure needs somewhere to be read: the field the name was typed in is
 *  the only place that can both say why and let the reader fix it. */

import { validateBranchName, worktreeDirName } from '../../../../shared/branch-name'
import { session } from '../session'

/** What the reader chose: a branch to isolate on, or nothing. */
export type WorktreeChoice = { branch: string } | null

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

class WorktreeAsk {
  /** Whether the question is on screen. */
  open = $state(false)
  /** True once the reader has said yes and is naming the branch. */
  naming = $state(false)
  branch = $state('')
  /** True while the thread is being made. The dialog is the pending state:
   *  there is no column yet to put one in. */
  creating = $state(false)
  /** What the backend said when the last attempt failed. */
  failure = $state<string | null>(null)
  /** Branches and directories this workspace's worktrees already use, read
   *  when the question opens so a taken name is refused under the field rather
   *  than by git a round trip later. */
  #taken = $state.raw<string[]>([])

  #answer: ((threadId: string | null) => void) | null = null
  #make: ((choice: WorktreeChoice) => Promise<string | null>) | null = null

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

  /** Asks, then makes the thread the reader asked for.
   *
   *  Resolves with the new thread's id, or null when the reader backed out of
   *  the creation entirely. `make` is what actually creates it, so this module
   *  never learns what a thread is — only what tree it should be in. */
  run(
    workspaceId: string,
    make: (choice: WorktreeChoice) => Promise<string | null>,
  ): Promise<string | null> {
    if (this.open) return Promise.resolve(null)

    this.open = true
    this.naming = false
    this.creating = false
    this.failure = null
    this.branch = ''
    this.#make = make
    void this.#readTaken(workspaceId)

    return new Promise<string | null>((resolve) => {
      this.#answer = resolve
    })
  }

  /** The names this workspace has already used. A read that fails leaves the
   *  list empty: git refuses a duplicate anyway, and a dialog that would not
   *  let a legal name through because a listing failed is worse. */
  async #readTaken(workspaceId: string): Promise<void> {
    try {
      const { worktrees } = await session.invoke('listWorktrees', { workspaceId })
      if (!this.open) return
      this.#taken = worktrees.flatMap((tree) => [tree.branch, worktreeDirName(tree.branch)])
    } catch {
      this.#taken = []
    }
  }

  #settle(threadId: string | null): void {
    const resolve = this.#answer
    this.open = false
    this.naming = false
    this.creating = false
    this.failure = null
    this.branch = ''
    this.#taken = []
    this.#answer = null
    this.#make = null
    resolve?.(threadId)
  }

  /** Creates the thread, holding the dialog up while git runs.
   *
   *  A failure keeps the dialog open on the field: the name is the thing most
   *  likely to be wrong, and the reader is the only one who can pick another. */
  async #create(choice: WorktreeChoice): Promise<void> {
    const make = this.#make
    if (!make || this.creating) return

    this.creating = true
    this.failure = null
    const threadId = await make(choice)
    if (!this.open) return

    if (threadId !== null) {
      this.#settle(threadId)
      return
    }

    this.creating = false
    if (choice === null) {
      // Nothing to fix here — the plain thread failed for its own reasons, and
      // the dialog has no field that would change the answer.
      this.#settle(null)
      return
    }
    this.failure = 'git would not make that worktree'
    this.#taken = [...this.#taken, choice.branch]
  }

  /** One key while the question is up. Always consumed, except a bare
   *  modifier: reaching for a capital is not an answer. */
  handleKey(event: { key: string }): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false
    // While git runs there is nothing to answer, and `esc` must not abandon a
    // checkout that is halfway made.
    if (this.creating) return true

    if (!this.naming) {
      // Before the field: this is a yes-or-no question with `no` focused.
      if (event.key === 'y') this.naming = true
      else if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'n') {
        void this.#create(null)
      }
      return true
    }

    if (event.key === 'Escape') {
      // Back to the question, not out of it. A reader who mistyped a name is
      // not asking to abandon the thread.
      this.naming = false
      this.branch = ''
      this.failure = null
      return true
    }
    if (event.key === 'Enter') {
      if (this.ready) void this.#create({ branch: this.branch })
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

  /** The pointer's answers, for the two buttons. */
  yes(): void {
    this.naming = true
  }

  no(): void {
    void this.#create(null)
  }

  take(): void {
    if (this.ready) void this.#create({ branch: this.branch })
  }
}

export const worktreeAsk = new WorktreeAsk()
