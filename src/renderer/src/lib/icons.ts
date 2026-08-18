/** Every mark this app draws, by what it means.
 *
 *  Before this the marks were unicode glyphs written inline: `▸`, `✓`, `↗`,
 *  `⑂`. Coverage differed by platform font, weights did not match each other,
 *  nothing sat on a common grid, and the same idea could be drawn with two
 *  different characters in two places with nobody the wiser.
 *
 *  **Codicons first.** They are VS Code's own set — the nerd-font feel by
 *  construction, since Nerd Fonts embed them — pixel-hinted at 16px, and every
 *  code-native symbol this app needs already exists there. They ship as
 *  individual SVGs with `fill="currentColor"`, so Vite's `?raw` is the whole
 *  build story: no icon font, no runtime, no network, and only the icons named
 *  here are in the bundle.
 *
 *  **Phosphor (light) is the sanctioned fallback**, for concepts Codicons has
 *  no icon for. Nothing has needed it yet, so the dependency is not installed:
 *  an unused package is a liability, and the rule matters more than shipping
 *  it early. When a gap appears, add `phosphor-svelte`, put the entry here,
 *  and name the gap in a comment beside it — the registry is where the
 *  Codicons-before-Phosphor rule is kept honest and visible.
 *
 *  ## What stays unicode
 *
 *  Text, not iconography. These are punctuation a reader reads, and an icon
 *  would be a picture of a letter:
 *
 *  - `·` — the separator between parts of a row
 *  - `…` — elision
 *  - `⏎`, `⌘` and the rest of the key caps — a key legend is the glyph
 *    printed on the key, not a symbol for it
 *
 *  Also staying: the ledger's `■` status nodes, which are drawn as coloured
 *  squares by the design and are a shape rather than an icon.
 */

import chevronDown from '@vscode/codicons/src/icons/chevron-down.svg?raw'
import chevronRight from '@vscode/codicons/src/icons/chevron-right.svg?raw'
import check from '@vscode/codicons/src/icons/check.svg?raw'
import close from '@vscode/codicons/src/icons/close.svg?raw'
import error from '@vscode/codicons/src/icons/error.svg?raw'
import file from '@vscode/codicons/src/icons/file.svg?raw'
import fileMedia from '@vscode/codicons/src/icons/file-media.svg?raw'
import gitBranch from '@vscode/codicons/src/icons/git-branch.svg?raw'
import linkExternal from '@vscode/codicons/src/icons/link-external.svg?raw'
import arrowDown from '@vscode/codicons/src/icons/arrow-down.svg?raw'
import circleFilled from '@vscode/codicons/src/icons/circle-filled.svg?raw'
import circleLarge from '@vscode/codicons/src/icons/circle-large.svg?raw'
import warning from '@vscode/codicons/src/icons/warning.svg?raw'
import info from '@vscode/codicons/src/icons/info.svg?raw'
import pass from '@vscode/codicons/src/icons/pass.svg?raw'
import passFilled from '@vscode/codicons/src/icons/pass-filled.svg?raw'

/** Named for what it means here, not for what the pack calls it. A rename in
 *  the pack is then one line, and a reader of a component sees the intent. */
export const ICONS = {
  'chevron-right': chevronRight,
  'chevron-down': chevronDown,
  check,
  close,
  error,
  warning,
  file,
  image: fileMedia,
  open: linkExternal,
  branch: gitBranch,
  down: arrowDown,
  info,
  /** A checkbox, drawn as the circle Codicons uses for one. The design's
   *  squares (`□`/`■`) had no Codicon at any weight — the closest is
   *  `primitive-square`, which is not in this release — and one shape used
   *  consistently reads better than two that nearly match. */
  box: circleLarge,
  'box-done': passFilled,
  'box-checked': pass,
  dot: circleFilled,
} as const

export type IconName = keyof typeof ICONS

export function iconSvg(name: IconName): string {
  return ICONS[name]
}

/** Whether a name is one this app draws. The settings and keymap screens build
 *  labels from data, and a typo there should draw nothing rather than throw. */
export function isIcon(name: string): name is IconName {
  return name in ICONS
}
