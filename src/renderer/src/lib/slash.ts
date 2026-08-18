import { fuzzyFilter } from './fuzzy'
import type { ProjectCommand, SurfaceSource } from '../../../shared/project-surface'

export type SlashId = 'commit' | 'compact' | 'model' | 'worktrees' | 'reload' | 'project'

/** Where an entry came from. A reader picking a command should know whether it
 *  is the app's, the repository's, or one they installed on this machine. */
export type SlashSource = 'built-in' | SurfaceSource

export interface SlashCommand {
  id: SlashId
  name: string
  description: string
  source: SlashSource
  /** For a project command: the text sent to pi, which expands the template
   *  itself. The app invents no argument syntax — `expandPromptTemplate` has
   *  one already, and a second would disagree with it. */
  prompt?: string
}

/** What `/` offers.
 *
 *  Only commands that do something. The spec also lists `/context`, which needs
 *  a context breakdown surface that does not exist yet; it is omitted rather
 *  than listed as a menu entry that would do nothing when picked. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: 'commit', name: '/commit', description: 'review and commit changes', source: 'built-in' },
  {
    id: 'compact',
    name: '/compact',
    description: 'summarize thread, free context',
    source: 'built-in',
  },
  { id: 'model', name: '/model', description: 'switch model / reasoning', source: 'built-in' },
  {
    id: 'worktrees',
    name: '/worktrees',
    description: 'list and sweep this workspace’s worktrees',
    source: 'built-in',
  },
]

/** The project's own commands, as menu entries.
 *
 *  A project command never replaces a built-in of the same name. Both appear,
 *  each saying where it came from, and the built-ins sort first: `/commit`
 *  opens the commit card, and a repository that could capture that name would
 *  change what a control in the app does, for a reader with no reason to
 *  suspect it. */
export function projectEntries(commands: readonly ProjectCommand[]): SlashCommand[] {
  return commands.map((command) => ({
    id: 'project' as const,
    name: `/${command.name}`,
    description: command.description,
    source: command.source,
    prompt: `/${command.name}`,
  }))
}

/** Built-ins first, then the project's, in one list. */
export function allSlash(project: readonly ProjectCommand[] = []): SlashCommand[] {
  return [...SLASH_COMMANDS, ...projectEntries(project)]
}

/** The menu is open only while the text is one `/`-word at the very start.
 *
 *  Position 0 on purpose: a message may legitimately contain a path like
 *  `src/lib`, and popping a command menu in the middle of a sentence would
 *  fight the person typing it. A space ends the menu — by then they are writing
 *  prose, not choosing a command. */
export function slashQuery(text: string): string | null {
  if (!text.startsWith('/')) return null

  const rest = text.slice(1)
  if (/\s/.test(rest)) return null

  return rest
}

export function filterSlash(query: string, project: readonly ProjectCommand[] = []): SlashCommand[] {
  return fuzzyFilter(allSlash(project), query, (command) => command.name)
}

/** Whether this text names a command that exists.
 *
 *  Anything else is a literal message: someone who types `/shrug` meant to say
 *  `/shrug`, and swallowing it would lose what they wrote. */
export function resolveSlash(
  text: string,
  project: readonly ProjectCommand[] = [],
): SlashCommand | null {
  const query = slashQuery(text.trim())
  if (query === null) return null

  // `find` over built-ins first is the same rule the menu's order states: a
  // typed `/commit` is the app's, whatever the repository ships.
  return allSlash(project).find((command) => command.name === `/${query}`) ?? null
}
