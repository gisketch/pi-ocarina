import type { GitChange } from '../../../../shared/protocol'
import { bridge } from '../bridge'
import { app } from './app.svelte'
import { git } from './git.svelte'
import { toasts } from './toasts.svelte'

/** The commit card's state.
 *
 *  The card never commits by itself. `commit` runs because a person pressed
 *  the key that says what it does — which is why nothing here is called from
 *  `open`. */
class Commit {
  /** Which workspace the open card belongs to. Null when it is closed. */
  workspaceId = $state.raw<string | null>(null)
  changes = $state.raw<GitChange[]>([])
  message = $state.raw('')
  loading = $state.raw(false)
  /** True while the message is being typed rather than read. */
  editing = $state.raw(false)
  /** True while git is running, so a second press cannot commit twice. */
  running = $state.raw(false)
  /** Why the last attempt failed, shown in the card as well as in a toast. */
  error = $state.raw<string | null>(null)

  get open(): boolean {
    return this.workspaceId !== null
  }

  /** Reads what would be committed. Opens on the workspace focused now, so a
   *  card can never commit into a folder the user has since left. */
  async load(): Promise<void> {
    const workspaceId = app.workspace.id
    if (!workspaceId || !bridge) return

    this.workspaceId = workspaceId
    this.changes = []
    this.message = ''
    this.editing = false
    this.error = null
    this.loading = true

    try {
      const draft = await bridge.git.changes(workspaceId)
      // A card that opened on one workspace must not fill with another's
      // changes because the read outlived the user's attention.
      if (this.workspaceId !== workspaceId) return
      this.changes = draft.changes
      this.message = draft.message
    } catch (cause) {
      this.error = describe(cause)
    } finally {
      this.loading = false
    }
  }

  close(): void {
    this.workspaceId = null
    this.changes = []
    this.editing = false
    this.running = false
  }

  async run({ push }: { push: boolean }): Promise<void> {
    const workspaceId = this.workspaceId
    if (!workspaceId || !bridge || this.running || this.changes.length === 0) return

    this.running = true
    this.error = null
    const result = await bridge.git
      .commit(workspaceId, {
        message: this.message,
        // The card commits what the card showed. Anything written since it
        // opened is not in this list and is left where it is.
        paths: this.changes.map((change) => change.path),
        push,
      })
      .catch((cause: unknown) => ({ ok: false as const, stage: 'commit' as const, reason: describe(cause) }))
    this.running = false
    // The card may have been closed and reopened on another workspace while
    // git ran. Closing it now would shut a card this result is not about.
    const stillOurs = this.workspaceId === workspaceId

    if (result.ok) {
      toasts.push({ tone: 'ok', text: result.pushed ? 'committed and pushed' : 'committed' })
      git.refresh(workspaceId)
      if (stillOurs) this.close()
      return
    }

    // A failed push leaves the commit made. Closing the card is right — the
    // work is saved — and the toast is what carries the retry.
    if (result.stage === 'push') {
      toasts.push({
        tone: 'error',
        text: `push failed — ${result.reason}`,
        label: 'retry',
        run: () => void this.retryPush(workspaceId),
      })
      git.refresh(workspaceId)
      if (stillOurs) this.close()
      return
    }

    if (stillOurs) this.error = result.reason
  }

  /** Pushes what is already committed. The commit is not made a second time. */
  async retryPush(workspaceId: string): Promise<void> {
    if (!bridge) return

    const result = await bridge.git
      .push(workspaceId)
      .catch((cause: unknown) => ({ ok: false as const, stage: 'push' as const, reason: describe(cause) }))

    if (result.ok) {
      toasts.push({ tone: 'ok', text: 'pushed' })
    } else {
      toasts.push({
        tone: 'error',
        text: `push failed — ${result.reason}`,
        label: 'retry',
        run: () => void this.retryPush(workspaceId),
      })
    }
    git.refresh(workspaceId)
  }

  /** Answers a key while the card is open. Returns true when it was consumed.
   *
   *  The card owns every key it is given: it is a question about work that
   *  cannot be taken back, and a binding running underneath it could move the
   *  focus out from under the commit. */
  handleKey(event: { key: string }): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false

    if (this.editing) {
      // Enter finishes the message rather than committing: a key that both
      // ends typing and writes a commit would commit on a stray return.
      if (event.key === 'Enter' || event.key === 'Escape') this.editing = false
      // Everything else belongs to the input the caret is in.
      return event.key === 'Enter' || event.key === 'Escape'
    }

    // The running guard comes first, escape included: a commit in flight is
    // exactly when the card must not be dismissed. Dismissing it would reset
    // `running`, and a second `c` would race a second `git add` against the
    // first over the same index lock.
    if (this.running) return true

    if (event.key === 'Escape') {
      this.close()
      return true
    }

    if (event.key === 'c') void this.run({ push: false })
    else if (event.key === 'p') void this.run({ push: true })
    else if (event.key === 'e') this.editing = true

    return true
  }
}

/** Keys that are not an answer: reaching for a capital presses Shift first. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export const commit = new Commit()
