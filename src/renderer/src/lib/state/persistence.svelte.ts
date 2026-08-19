import { app } from './app.svelte'
import { bridge } from '../bridge'
import { catalog } from './catalog.svelte'
import { config } from './config.svelte'
import { keybinds } from './keybinds.svelte'
import { preferences } from './preferences.svelte'
import { clampThread } from '../strip'
import { terminals } from './terminal.svelte'
import { toasts } from './toasts.svelte'

const SAVE_DEBOUNCE_MS = 250

/** Restores layout from the catalog, then keeps it in sync.
 *  No-ops in the browser harness, where no bridge exists. */
export function startPersistence(): () => void {
  const desktop = bridge
  if (!desktop) return () => {}

  let restored = false
  let timer: ReturnType<typeof setTimeout> | null = null

  // The reader's own file, read here rather than by whichever component
  // happens to draw it. The keymap is applied from this read, and a keyboard
  // that only worked because a banner was mounted would be a keyboard that
  // stopped working the day the banner moved.
  void config.load()
  // The Keymaps screen's saves, merged underneath the file above — the order
  // of the two loads does not matter, because each rebuilds the merge whole.
  void keybinds.load()

  // The real workspace list has to land first. Restoring against the demo
  // catalog would clamp a saved position to the wrong thread counts, and which
  // of the two promises won was otherwise a matter of timing.
  void Promise.all([desktop.catalog.load(), catalog.load()]).then(async ([{ state, warning }]) => {
    if (warning) console.warn(`[catalog] ${warning}`)
    preferences.apply(state.preferences)
    let skipped = 0
    const starts: Promise<void>[] = []
    for (const workspace of app.workspaces) {
      for (const pane of state.panes?.[workspace.id] ?? []) {
        const host = workspace.threads.find((thread) => thread.id === pane.hostId && !thread.terminal)
        const occupied = workspace.threads.some(
          (thread) => thread.attachment?.hostId === pane.hostId,
        )
        if (!host || occupied) {
          skipped += 1
          continue
        }
        catalog.openTerminal(workspace.id, pane.hostId, pane.id, pane.side)
        starts.push(
          terminals.create(pane.id, workspace.id).catch((cause: unknown) => {
            catalog.failColumn(pane.id, cause)
            toasts.push({
              tone: 'error',
              text: cause instanceof Error ? cause.message : String(cause),
            })
          }),
        )
      }
    }
    await Promise.all(starts)
    if (skipped > 0) {
      toasts.push({
        tone: 'info',
        text: `${skipped} terminal ${skipped === 1 ? 'attachment was' : 'attachments were'} not restored`,
      })
    }
    catalog.applyOrder(state.order ?? {})
    app.goWorkspace(Math.min(state.workspaceIndex, app.workspaces.length - 1))
    app.focus = app.workspaces.map((workspace, i) =>
      clampThread(state.focus[i] ?? 0, workspace.threads.length),
    )
    restored = true
  })

  const stop = $effect.root(() => {
    $effect(() => {
      // Track the layout fields; skip writes until the restore has landed so we
      // never overwrite a good catalog with startup defaults.
      const snapshot = {
        workspaceIndex: app.workspaceIndex,
        focus: [...app.focus],
        preferences: preferences.stored,
        // Tracked so a ⇧H/⇧L rearrangement is saved like any other position.
        order: Object.fromEntries(
          app.workspaces.map((workspace) => [
            workspace.id,
            workspace.threads.map((thread) => thread.id),
          ]),
        ),
        panes: Object.fromEntries(
          app.workspaces.map((workspace) => [
            workspace.id,
            workspace.threads
              .filter((thread) => thread.terminal && thread.attachment)
              .map((thread) => ({ id: thread.id, ...thread.attachment! })),
          ]),
        ),
      }
      if (!restored) return

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void desktop.catalog.save(snapshot)
        timer = null
      }, SAVE_DEBOUNCE_MS)
    })
  })

  return () => {
    if (timer) clearTimeout(timer)
    stop()
  }
}
