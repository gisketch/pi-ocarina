import { quitMessage } from '../../../../shared/quit'
import { bridge } from '../bridge'
import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { confirm } from './confirm.svelte'
import { git } from './git.svelte'
import { models } from './models.svelte'
import { preferences } from './preferences.svelte'

/** The app-level wiring: everything that runs because the app is open rather
 *  than because a particular thing is on screen.
 *
 *  Kept out of `App.svelte` so that file stays a layout. Each function is
 *  called from its own `$effect` there, which is what gives them a lifetime
 *  and lets the ones that return a cleanup be torn down. */

/** Workspaces already asked about, so a status arriving does not re-ask about
 *  every one of them.
 *
 *  Both watchers read `catalog.workspaces`, and publishing a status rewrites
 *  that array — so without this, one workspace's answer costs a git run in
 *  every workspace, and a fresh start costs a run per workspace per workspace.
 *  The reads have to stay: they are what makes these effects fire on a pin at
 *  all. Remembering is what makes them fire only then. */
const refreshed = new Set<string>()
let lastFocused = ''

/** Asks about a folder that was just pinned, and about nothing else. */
export function watchPinnedGit(): void {
  const ids = catalog.workspaces.map((workspace) => workspace.id)
  for (const id of ids) {
    if (refreshed.has(id)) continue
    refreshed.add(id)
    git.refresh(id)
  }

  // A folder that is unpinned and pinned again is a folder to ask about again.
  const present = new Set(ids)
  for (const id of refreshed) if (!present.has(id)) refreshed.delete(id)
}

/** Re-reads the workspace being looked at. Main cannot see a commit made in
 *  another terminal while this workspace was off screen. */
export function watchFocusedGit(): void {
  const id = app.workspace.id
  if (id === lastFocused) return
  lastFocused = id
  git.refresh(id)
}

/** Quitting on top of running work asks in the app's own modal rather than a
 *  platform dialog, so every destructive question looks the same. */
export function answerQuitConfirm(): (() => void) | undefined {
  const desktop = bridge
  if (!desktop) return undefined

  // Main answers natively when this one takes too long; the question has to
  // come off screen or the user sees it twice.
  //
  // Counted rather than flagged: the withdrawn question's own answer must not
  // be sent back, or it would arrive as the answer to whatever main asks next.
  let asked = 0
  let withdrawn = 0

  const stopWithdraw = desktop.lifecycle.onWithdrawQuit(() => {
    withdrawn = asked
    if (confirm.pending) confirm.answer(false)
  })

  const stopAsk = desktop.lifecycle.onConfirmQuit(async (running) => {
    const generation = (asked += 1)
    const { message, detail } = quitMessage(running)
    const ok = await confirm.ask({
      title: 'quit with work running',
      message: `${message} ${detail}`,
      confirmLabel: 'quit',
    })
    if (withdrawn >= generation) return
    desktop.lifecycle.answerQuit(ok)
  })

  return () => {
    stopWithdraw()
    stopAsk()
  }
}
/** Writes the theme to the document element.
 *
 *  The accent tokens are substituted where they are declared (`:root`), so the
 *  hue must be set there — on `.shell` every inherited `--accent` would stay
 *  on the default. Grain and motion are declared in CSS against these
 *  attributes, so the settings switches and the OS reduce-motion preference
 *  say the same thing in the same place. */
export function applyTheme(): void {
  document.documentElement.style.setProperty('--accent-hue', String(app.workspace.hue))
  document.documentElement.dataset.grain = preferences.grain ? 'on' : 'off'
  document.documentElement.dataset.motion = preferences.motion ? 'on' : 'off'
}

/** Loaded once, ahead of the first `m`, so the selector opens instantly. */
export function loadModels(): void {
  void models.load()
}
