/** The worktrees a workspace has, and taking the spent ones away.
 *
 *  Worktrees outlive the columns that made them: a thread closed with commits
 *  keeps its checkout, and a thread open when the app quit keeps it too. That
 *  is the right default — nothing is deleted behind the reader's back — but it
 *  means the list has to be reachable, or the folder fills up with checkouts
 *  nobody remembers making.
 *
 *  Nothing here runs at startup. An app that removes directories when it
 *  launches is an app nobody trusts with a repository. */

import { session } from '../session'
import { app } from './app.svelte'
import { confirm } from './confirm.svelte'
import { toasts } from './toasts.svelte'

export interface SweepEntry {
  branch: string
  path: string
  dirty: number
  commits: number
  /** True when a column on the strip is running in this checkout. Those are
   *  listed, and never offered for removal: the agent inside is still using
   *  the files. */
  live: boolean
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

class Sweep {
  open = $state(false)
  loading = $state(false)
  entries = $state.raw<SweepEntry[]>([])
  at = $state(0)
  error = $state<string | null>(null)
  #workspaceId: string | null = null

  get focused(): SweepEntry | null {
    return this.entries[this.at] ?? null
  }

  /** Whether the focused entry can be removed at all. A live one never can:
   *  its files are open in front of an agent. */
  get removable(): boolean {
    const one = this.focused
    return one !== null && !one.live && one.commits === 0
  }

  async show(): Promise<void> {
    const workspaceId = app.workspace.id
    this.#workspaceId = workspaceId
    this.open = true
    this.loading = true
    this.error = null
    this.at = 0

    try {
      const { worktrees } = await session.invoke('listWorktrees', { workspaceId })
      if (this.#workspaceId !== workspaceId) return
      this.entries = worktrees.map((tree) => ({ ...tree, live: this.#isLive(tree.branch) }))
    } catch (cause) {
      if (this.#workspaceId !== workspaceId) return
      this.entries = []
      this.error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      this.loading = false
    }
  }

  close(): void {
    this.open = false
    this.entries = []
    this.at = 0
    this.error = null
    this.#workspaceId = null
  }

  /** Removes the focused checkout, asking first when it holds uncommitted
   *  work. A branch with commits is refused before anything is asked. */
  async remove(): Promise<void> {
    const workspaceId = this.#workspaceId
    const one = this.focused
    if (!workspaceId || !one) return

    if (one.live) {
      toasts.push({ tone: 'info', text: `${one.branch} has a thread open` })
      return
    }
    if (one.commits > 0) {
      toasts.push({ tone: 'info', text: `${one.branch} holds ${one.commits} commits` })
      return
    }

    if (one.dirty > 0) {
      const discard = await confirm.ask({
        title: 'DISCARD WORKTREE',
        message: `${one.branch} has ${one.dirty} uncommitted file${
          one.dirty === 1 ? '' : 's'
        }. Discarding removes the checkout and everything written in it.`,
        confirmLabel: 'discard',
      })
      if (!discard) return
    }

    const { ok, reason } = await session
      .invoke('removeWorktree', { workspaceId, path: one.path, force: one.dirty > 0 })
      .catch((cause: unknown) => ({
        ok: false,
        reason: cause instanceof Error ? cause.message : String(cause),
      }))

    if (!ok) {
      toasts.push({ tone: 'error', text: `kept ${one.branch} · ${reason ?? 'git refused'}` })
      return
    }

    // Re-read rather than splice: another column may have closed while this
    // list was up, and a list that is only ever edited drifts from the folder
    // it claims to describe.
    await this.show()
  }

  handleKey(event: { key: string }): boolean {
    if (MODIFIER_KEYS.has(event.key)) return false

    switch (event.key) {
      case 'Escape':
        this.close()
        return true
      case 'j':
      case 'ArrowDown':
        this.at = Math.min(Math.max(0, this.entries.length - 1), this.at + 1)
        return true
      case 'k':
      case 'ArrowUp':
        this.at = Math.max(0, this.at - 1)
        return true
      case 'x':
      case 'd':
        void this.remove()
        return true
    }

    return true
  }

  #isLive(branch: string): boolean {
    return app.workspace.threads.some((thread) => thread.branch === branch)
  }
}

export const sweep = new Sweep()
