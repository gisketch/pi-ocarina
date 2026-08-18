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
import { filterSlash, resolveSlash, slashQuery, type SlashCommand } from '../slash'
import { fuzzyFilter, wrapIndex } from '../fuzzy'
import { app } from './app.svelte'
import { files } from './files.svelte'
import { projectSurface } from './project-surface.svelte'

export interface CompletionDeps {
  text: () => string
  setText: (next: string) => void
  field: () => HTMLTextAreaElement | null
  /** Only the focused column offers completions: the others are showing a
   *  draft, not being typed into. */
  focused: () => boolean
}

export type MenuName = 'slash' | 'mention' | null

export function completions(deps: CompletionDeps) {
  const query = $derived(slashQuery(deps.text()))

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
    query === null || !deps.focused()
      ? []
      : filterSlash(query, projectSurface.surface.commands, {
          hasThread: app.threadId !== null,
          skills: projectSurface.surface.skills,
        }),
  )

  /** Where the caret is, so `@` knows which word it is inside. */
  let caret = $state(0)
  /** Where a mention the reader dismissed started, so Escape sticks. Cleared
   *  as soon as they type a different one — otherwise Escape would silently
   *  disable the picker for the rest of the message. */
  let dismissed = $state<number | null>(null)

  const found = $derived(mentionAt(deps.text(), caret))
  const mention = $derived(
    !deps.focused() || (found && found.start === dismissed) ? null : found,
  )
  const paths = $derived(
    mention === null
      ? []
      : fuzzyFilter(files.files(app.workspace.id), mention.query, (path) => path).slice(0, 8),
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
    void query
    void mention?.query
    picked = 0
  })

  function insertMention(path: string): void {
    if (!mention) return

    const next = applyMention(deps.text(), mention, path)
    deps.setText(next.text)
    picked = 0
    // Restored after Svelte writes the new value, or the caret jumps to the end.
    queueMicrotask(() => {
      deps.field()?.setSelectionRange(next.caret, next.caret)
      caret = next.caret
    })
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
    },
    dismiss(): void {
      dismissed = mention?.start ?? null
    },
    trackCaret(): void {
      caret = deps.field()?.selectionStart ?? 0
    },
    insertMention,
  }
}
