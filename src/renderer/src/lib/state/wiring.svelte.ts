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

/** Asks about a folder that was just pinned.
 *
 *  Derived from the ids alone: a thread appearing in a workspace must not
 *  re-ask about every workspace. This fires on pin and unpin, and on nothing
 *  else. */
export function watchPinnedGit(): void {
  const ids = catalog.workspaces.map((workspace) => workspace.id).join(' ')
  for (const id of ids.split(' ')) git.refresh(id)
}

/** Re-reads the workspace being looked at. Main cannot see a commit made in
 *  another terminal while this workspace was off screen. */
export function watchFocusedGit(): void {
  git.refresh(app.workspace.id)
}

/** Quitting on top of running work asks in the app's own modal rather than a
 *  platform dialog, so every destructive question looks the same. */
export function answerQuitConfirm(): (() => void) | undefined {
  const desktop = bridge
  if (!desktop) return undefined

  return desktop.lifecycle.onConfirmQuit(async (running) => {
    const { message, detail } = quitMessage(running)
    const ok = await confirm.ask({
      title: 'quit with work running',
      message: `${message} ${detail}`,
      confirmLabel: 'quit',
    })
    desktop.lifecycle.answerQuit(ok)
  })
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
