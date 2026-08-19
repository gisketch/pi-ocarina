/** The two menus the composer opens, and what picking one does.
 *
 *  `/` lists the app's own commands, the project's, and its skills; `@` lists
 *  files. Held apart from the composer because it is a complete idea — what is
 *  on offer, which entry is highlighted, and what taking it writes into the
 *  field — and because the composer is a component this repository has no way
 *  to test, while this is plain state a reader can follow.
 *
 *  A factory over accessors rather than a store: there is one of these per
 *  column, and each belongs to that column's own field. */

import { applyMention, mentionAt } from '../mention'
import type { CaretField } from '../chip-field'
import { applySlash, filterSlash, resolveSlash, slashAt, type SlashCommand } from '../slash'
import { fuzzyFilter, wrapIndex } from '../fuzzy'
import { app } from './app.svelte'
import { files } from './files.svelte'
import { projectSurface } from './project-surface.svelte'

export interface CompletionDeps {
  text: () => string
  setText: (next: string) => void
  field: () => CaretField | null
  /** Only the focused column offers completions: the others are showing a
   *  draft, not being typed into. */
  focused: () => boolean
}

export type MenuName = 'slash' | 'mention' | null

export function completions(deps: CompletionDeps) {
  /** Where the caret is, so `@` and `/` know which word it is inside. */
  let caret = $state(0)

  /** The token an insert just completed, so neither menu reopens on its own
   *  output. Inserts add no trailing space any more — the spacing around a
   *  chip is the reader's — so the caret lands right after a token both
   *  finders still match. Keyed by start *and* query: editing the token makes
   *  it a different query and the menus come back. */
  let completed = $state<{ start: number; query: string } | null>(null)

  const rawToken = $derived(slashAt(deps.text(), caret))
  const token = $derived(
    rawToken &&
    completed &&
    rawToken.start === completed.start &&
    rawToken.query === completed.query
      ? null
      : rawToken,
  )

  // The project's commands and skills come from the surface main already read
  // for the workspace screen. Read per focused column rather than per
  // keystroke: the loader answers from memory, but the command crosses a
  // process boundary and `/` is typed often.
  //
  // The workspace always, the thread only when this column is one — a fresh
  // column sits in a folder that has commands, and it is the column most
  // likely to receive the first message.
  $effect(() => {
    if (deps.focused()) void projectSurface.load(app.workspace.id, app.threadId)
  })
  $effect(() => {
    if (deps.focused()) files.ensure(app.workspace.id)
  })

  const slash = $derived(
    token === null || !deps.focused()
      ? []
      : // Mid-sentence, only skills: `/commit` inside a sentence would throw
        // the sentence away, and a menu offering it there is a menu offering a
        // mistake. A skill is text, so it belongs anywhere text does.
        filterSlash(token.query, token.leading ? projectSurface.surface.commands : [], {
          hasThread: app.threadId !== null,
          skills: projectSurface.surface.skills,
          builtIn: token.leading,
        }),
  )

  /** Where a mention the reader dismissed started, so Escape sticks. Cleared
   *  as soon as they type a different one — otherwise Escape would silently
   *  disable the picker for the rest of the message. */
  let dismissed = $state<number | null>(null)

  const found = $derived(mentionAt(deps.text(), caret))
  const mention = $derived(
    !deps.focused() ||
    (found && found.start === dismissed) ||
    (found && completed && found.start === completed.start && found.query === completed.query)
      ? null
      : found,
  )
  const paths = $derived(
    mention === null
      ? []
      : // The menu scrolls, so this is a bound on how far a fuzzy match is
        // worth chasing rather than on what fits: past a few dozen the reader
        // types another letter instead of scrolling.
        fuzzyFilter(files.files(app.workspace.id), mention.query, (path) => path).slice(0, 40),
  )

  // One menu at a time. A slash only ever opens at position 0 and a mention
  // never starts there, so the two cannot both be open.
  const menu = $derived<MenuName>(slash.length > 0 ? 'slash' : paths.length > 0 ? 'mention' : null)
  const options = $derived(menu === 'slash' ? slash.length : paths.length)
  let picked = $state(0)
  const active = $derived(menu === null ? -1 : wrapIndex(picked, options))

  // A new query starts at the top of its own list, so the highlight never
  // points at an entry the last query happened to leave it on.
  $effect(() => {
    void token?.query
    void mention?.query
    picked = 0
  })

  /** Writes the chosen thing where the token was, and puts the caret after it.
   *
   *  Restored in a microtask, after Svelte has written the new value — set
   *  before that and the caret jumps to the end of the field. */
  function write(next: { text: string; caret: number }): void {
    deps.setText(next.text)
    picked = 0
    queueMicrotask(() => {
      deps.field()?.setSelectionRange(next.caret, next.caret)
      caret = next.caret
    })
  }

  function insertMention(path: string): void {
    if (!mention) return
    completed = { start: mention.start, query: path }
    write(applyMention(deps.text(), mention, path))
  }

  /** Writes a skill into the sentence rather than running it. `/skill:name` is
   *  what pi expands, so that is what goes in the text; the mirror draws it as
   *  a chip and the reader sees the name they picked. */
  function insertSlash(command: SlashCommand): boolean {
    if (token === null || command.id !== 'skill') return false
    // The query the completed token will carry: the name past its `/`.
    completed = { start: token.start, query: command.name.slice(1) }
    write(applySlash(deps.text(), token, command))
    return true
  }

  return {
    get slash(): SlashCommand[] {
      return slash
    },
    get paths(): string[] {
      return paths
    },
    get menu(): MenuName {
      return menu
    },
    get options(): number {
      return options
    },
    get active(): number {
      return active
    },
    get caret(): number {
      return caret
    },
    /** Whether this text names a command that exists — the same list the menu
     *  offers, so what is typed and what is picked cannot disagree. */
    resolve(text: string): SlashCommand | null {
      return resolveSlash(text, projectSurface.surface.commands, {
        hasThread: app.threadId !== null,
        skills: projectSurface.surface.skills,
      })
    },
    highlight(index: number): void {
      picked = index
    },
    /** A new query starts at the top of its own list. */
    reset(): void {
      picked = 0
      completed = null
    },
    dismiss(): void {
      dismissed = mention?.start ?? null
    },
    trackCaret(): void {
      caret = deps.field()?.selectionStart ?? 0
    },
    insertMention,
    insertSlash,
    /** Whether picking runs the entry or writes it. Mid-sentence there is
     *  nothing to run: the sentence around it is the message. */
    get runnable(): boolean {
      return token?.leading === true
    },
  }
}
