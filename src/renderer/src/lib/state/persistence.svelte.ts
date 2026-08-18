import { app } from './app.svelte'
import { bridge } from '../bridge'
import { catalog } from './catalog.svelte'
import { config } from './config.svelte'
import { preferences } from './preferences.svelte'
import { clampThread } from '../strip'

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

  // The real workspace list has to land first. Restoring against the demo
  // catalog would clamp a saved position to the wrong thread counts, and which
  // of the two promises won was otherwise a matter of timing.
  void Promise.all([desktop.catalog.load(), catalog.load()]).then(([{ state, warning }]) => {
    if (warning) console.warn(`[catalog] ${warning}`)
    preferences.apply(state.preferences)
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
