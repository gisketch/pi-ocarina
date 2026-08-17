/** The question every new thread asks in a repository: its own worktree?
 *
 *  Modal, and shaped like `confirm`: one question at a time, answered from the
 *  keyboard, resolving a promise the caller is waiting on. It ranks with the
 *  other modals rather than with the strip's bindings, because a key that fell
 *  through would move a column behind a question the reader is answering.
 *
 *  The default is no. A worktree is a real directory and a real branch, and a
 *  reader who pressed `enter` past a dialog they did not read should end up
 *  with the thread they have always had. */

import { validateBranchName } from '../../../../shared/branch-name'

/** What the reader chose: a branch to isolate on, or nothing. */
export type WorktreeChoice = { branch: string } | null

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

class WorktreeAsk {
  /** Whether the question is on screen. */
  open = $state(false)
  /** True once the reader has said yes and is naming the branch. */
  naming = $state(false)
  branch = $state('')
  /** A name already taken, reported by the backend after a failed creation, so
   *  the next ask can say so before the reader waits on git again. */
  taken = $state<string | null>(null)

  #answer: ((choice: WorktreeChoice) => void) | null = null

  /** The rule the typed name breaks, or null. Empty while nothing is typed:
   *  a field that turns red before it has been used is scolding, not helping. */
  get problem(): string | null {
    if (this.branch === '') return null
    if (this.taken !== null && this.taken === this.branch) return 'that branch already exists'
    return validateBranchName(this.branch)
  }

  /** Whether `enter` can take the branch. */
  get ready(): boolean {
    return this.branch !== '' && this.problem === null
  }

  /** Asks, and resolves with what the reader chose. A second ask while one is
   *  open answers itself with no worktree rather than stacking. */
  ask(): Promise<WorktreeChoice> {
    if (this.open) return Promise.resolve(null)

    this.open = true
    this.naming = false
    this.branch = ''
    return new Promise<WorktreeChoice>((resolve) => {
      this.#answer = resolve
    })
  }

  /** Records a name git refused, so the field can say so on the next ask. */
  refuse(branch: string): void {
    this.taken = branch
  }

  #settle(choice: WorktreeChoice): void {
    const resolve = this.#answer
    this.open = false
    this.naming = false
    this.branch = ''
    this.#answer = null
    resolve?.(choice)
  }

  /** One key while the question is up. Always consumed, except a bare
   *  modifier: reaching for a capital is not an answer. */
  handleKey(event: { key: string }): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false

    if (!this.naming) {
      // Before the field: this is a yes-or-no question with `no` focused.
      if (event.key === 'y') this.naming = true
      else if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'n') {
        this.#settle(null)
      }
      return true
    }

    if (event.key === 'Escape') {
      // Back to the question, not out of it. A reader who mistyped a name is
      // not asking to abandon the thread.
      this.naming = false
      this.branch = ''
      return true
    }
    if (event.key === 'Enter') {
      if (this.ready) this.#settle({ branch: this.branch })
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
    this.#settle(null)
  }

  take(): void {
    if (this.ready) this.#settle({ branch: this.branch })
  }
}

export const worktreeAsk = new WorktreeAsk()

/** Asks the question, when there is a repository to ask it about.
 *
 *  A folder that is not a repository has no worktrees to make, so it is never
 *  asked — the dialog would be a keystroke with one possible answer. */
export async function chooseWorktree(isRepo: boolean): Promise<WorktreeChoice> {
  if (!isRepo) return null
  return worktreeAsk.ask()
}
