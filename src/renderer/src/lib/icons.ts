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
 *  no icon for. Every entry that reaches for it names the gap in a comment
 *  beside it — this registry is where the Codicons-before-Phosphor rule is
 *  kept honest and visible. `@phosphor-icons/core` ships the same raw SVGs,
 *  so both packs arrive the same way and neither has a runtime.
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
 *  The ledger's status nodes are *not* an exception any more: they were
 *  coloured squares, and each is now the icon of the tool whose row it marks —
 *  the `tool-*` entries below. Only the `■ PI` identity mark stays a glyph,
 *  because it is the app's own signature rather than a symbol for something.
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
import warning from '@vscode/codicons/src/icons/warning.svg?raw'
import info from '@vscode/codicons/src/icons/info.svg?raw'
// One per tool kind: a row's node says what kind of thing happened, which a
// coloured square could only ever say by being learned.
import search from '@vscode/codicons/src/icons/search.svg?raw'
import newFile from '@vscode/codicons/src/icons/new-file.svg?raw'
import edit from '@vscode/codicons/src/icons/edit.svg?raw'
import terminal from '@vscode/codicons/src/icons/terminal.svg?raw'
import symbolNamespace from '@vscode/codicons/src/icons/symbol-namespace.svg?raw'
import globe from '@vscode/codicons/src/icons/globe.svg?raw'
import checklist from '@vscode/codicons/src/icons/checklist.svg?raw'
import book from '@vscode/codicons/src/icons/book.svg?raw'
import robot from '@vscode/codicons/src/icons/robot.svg?raw'
import tools from '@vscode/codicons/src/icons/tools.svg?raw'
import sparkle from '@vscode/codicons/src/icons/sparkle.svg?raw'
// Language marks, for the rows that name a language server. Codicons has no
// brand icons and Phosphor has none either, so this is the third pack and the
// last: `simple-icons` is CC0, ships one SVG per icon, and only the ones named
// below reach the bundle.
import typescript from 'simple-icons/icons/typescript.svg?raw'
import javascript from 'simple-icons/icons/javascript.svg?raw'
import svelteMark from 'simple-icons/icons/svelte.svg?raw'
import python from 'simple-icons/icons/python.svg?raw'
import goMark from 'simple-icons/icons/go.svg?raw'
import rust from 'simple-icons/icons/rust.svg?raw'
// C# has no mark of its own here — Microsoft's trademark policy took it out of
// the set — so a C# row wears .NET's, which is the platform it names.
import dotnet from 'simple-icons/icons/dotnet.svg?raw'
import jsonMark from 'simple-icons/icons/json.svg?raw'
import html5 from 'simple-icons/icons/html5.svg?raw'
import cssMark from 'simple-icons/icons/css.svg?raw'
import ruby from 'simple-icons/icons/ruby.svg?raw'
import php from 'simple-icons/icons/php.svg?raw'
import markdown from 'simple-icons/icons/markdown.svg?raw'
// Phosphor, for the gap named at `box` below.
import square from '@phosphor-icons/core/assets/light/square-light.svg?raw'
import squareFilled from '@phosphor-icons/core/assets/fill/square-fill.svg?raw'

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
  /** A checkbox. **The Codicons gap**: this release ships no square outline —
   *  `primitive-square` is gone and every checkbox it has is a circle — and
   *  the design draws squares (`□`/`■`) everywhere. Phosphor at light weight
   *  is the fallback, and its 1.5px stroke sits closer to this app's line
   *  weight than a Codicon circle did anyway. */
  box: square,
  'box-done': squareFilled,

  // The tool kinds. Named `tool-*` so a glance at a component says which
  // vocabulary an icon came from, and so the map below cannot silently pick
  // up an unrelated entry.
  'tool-read': file,
  'tool-grep': search,
  'tool-write': newFile,
  'tool-edit': edit,
  'tool-bash': terminal,
  'tool-lsp': symbolNamespace,
  'tool-fetch': globe,
  'tool-todo': checklist,
  'tool-skill': book,
  'tool-agent': robot,
  'tool-raw': tools,
  'tool-think': sparkle,

  // Named for the language, not for the pack. `langIcon` below maps the
  // highlighter's language names onto these.
  'lang-ts': typescript,
  'lang-js': javascript,
  'lang-svelte': svelteMark,
  'lang-python': python,
  'lang-go': goMark,
  'lang-rust': rust,
  'lang-csharp': dotnet,
  'lang-json': jsonMark,
  'lang-html': html5,
  'lang-css': cssMark,
  'lang-ruby': ruby,
  'lang-php': php,
  'lang-markdown': markdown,
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

/** The icon a tool row wears in place of its node.
 *
 *  A coloured square said "something happened, and it went like this"; the
 *  colour still says the second half, and the shape now says the first without
 *  the reader having to learn it. `raw` is the honest fallback for a tool this
 *  app has no row for — a wrench, rather than a guess at what it did. */
export function toolIcon(kind: string, lang = ''): IconName {
  // A language server's row wears its language's mark: `lsp` on all six was
  // true and said nothing a reader could not see from the file beside it.
  if (kind === 'lsp') {
    const mark = langIcon(lang)
    if (mark) return mark
  }

  const name = `tool-${kind}`
  return isIcon(name) ? name : 'tool-raw'
}

/** How a language's name maps onto a mark. Several names share one: `tsx` is
 *  TypeScript, and `zsh` is a shell. */
const LANG_ALIAS: Readonly<Record<string, string>> = {
  tsx: 'ts',
  jsx: 'js',
  xml: 'html',
  yaml: 'markdown',
  toml: 'markdown',
}

/** The mark for a language, or none.
 *
 *  A row that names a language server says which language it asked. `lsp` on
 *  every one of them was true and told a reader nothing they could not already
 *  see from the file beside it. */
export function langIcon(lang: string): IconName | null {
  if (lang === '') return null
  const name = `lang-${LANG_ALIAS[lang] ?? lang}`
  return isIcon(name) ? name : null
}
