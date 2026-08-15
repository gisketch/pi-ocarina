import { app } from './app.svelte'
import { bridge } from '../bridge'
import { clampThread } from '../strip'

const SAVE_DEBOUNCE_MS = 250

/** Restores layout from the catalog, then keeps it in sync.
 *  No-ops in the browser harness, where no bridge exists. */
export function startPersistence(): () => void {
  const desktop = bridge
  if (!desktop) return () => {}

  let restored = false
  let timer: ReturnType<typeof setTimeout> | null = null

  void desktop.catalog.load().then(({ state, warning }) => {
    if (warning) console.warn(`[catalog] ${warning}`)
    // Clamp against the live workspace list: pins may have changed since the write.
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
