import { fuzzyFilter } from './fuzzy'
import type { IconName } from './icons'
import type { ProjectCommand, ProjectSkill, SurfaceSource } from '../../../shared/project-surface'

export type SlashId =
  | 'commit'
  | 'compact'
  | 'model'
  | 'worktrees'
  | 'reload'
  | 'project'
  | 'skill'

/** Where an entry came from. A reader picking a command should know whether it
 *  is the app's, the repository's, or one they installed on this machine. */
export type SlashSource = 'built-in' | SurfaceSource

export interface SlashCommand {
  id: SlashId
  /** What the reader types to name it, and what the menu matches on. */
  name: string
  /** What the menu draws, when that is not the name. A skill is `humanizer`
   *  on screen: the `/` is the key that opened the menu and `skill:` is pi's
   *  namespace, and neither is part of what the reader is looking for. */
  label?: string
  /** The mark beside it, so a skill and a command are told apart at a glance
   *  rather than by reading a prefix. */
  icon?: IconName
  description: string
  source: SlashSource
  /** For a project command or a skill: the text sent to pi, which expands it
   *  itself. The app invents no argument syntax — `expandPromptTemplate` and
   *  `_expandSkillCommand` have one already, and a second would disagree. */
  prompt?: string
  /** A skill the model will not load on its own. Worth saying in the menu:
   *  this entry is the only way it runs. */
  explicitOnly?: boolean
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
  {
    id: 'reload',
    name: '/reload',
    description: 're-read this project’s skills, commands and instructions',
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
    icon: 'tool-todo' as const,
    name: `/${command.name}`,
    description: command.description,
    source: command.source,
    prompt: `/${command.name}`,
  }))
}

/** The built-ins that need a session behind the column.
 *
 *  `/compact` summarises a transcript and `/reload` rebuilds the prompt pi has
 *  cached inside a session. A column with neither is not a place either can
 *  mean anything, so they are absent there rather than erroring. Everything
 *  else — `/commit`, `/model`, `/worktrees`, and every project command — is
 *  about the folder, and stays. */
const NEEDS_THREAD: ReadonlySet<string> = new Set(['compact', 'reload'])

/** The workspace's skills, as menu entries.
 *
 *  `/skill:name` is pi's own syntax, not one this app invented: `prompt()`
 *  expands it before the model sees anything, reading the file and wrapping it
 *  in a `<skill>` block. So the entry sends the name it shows, exactly as a
 *  project command does, and the app stays out of the way.
 *
 *  Every skill is offered, including the ones the model may not load itself —
 *  those especially. An `explicit only` skill is one whose *only* door is this
 *  menu, and it was the one door that did not exist. */
export function skillEntries(skills: readonly ProjectSkill[]): SlashCommand[] {
  return skills.map((skill) => ({
    id: 'skill' as const,
    // Matched and typed as `/name`, drawn as `name`, sent as `/skill:name`.
    // Three forms because they answer three questions: what a reader reaches
    // for, what they read, and what pi expands.
    name: `/${skill.name}`,
    label: skill.name,
    icon: 'tool-skill' as const,
    description: skill.description,
    source: skill.source,
    prompt: `/skill:${skill.name}`,
    explicitOnly: skill.explicitOnly,
  }))
}

/** Built-ins first, then the project's, in one list. */
export function allSlash(
  project: readonly ProjectCommand[] = [],
  { hasThread = true, skills = [] }: { hasThread?: boolean; skills?: readonly ProjectSkill[] } = {},
): SlashCommand[] {
  const built = hasThread ? SLASH_COMMANDS : SLASH_COMMANDS.filter((one) => !NEEDS_THREAD.has(one.id))
  // Skills last: they are the longest list by far, and a reader typing `/` is
  // most often reaching for one of the five built-ins.
  return [...built, ...projectEntries(project), ...skillEntries(skills)]
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

export function filterSlash(
  query: string,
  project: readonly ProjectCommand[] = [],
  options: { hasThread?: boolean; skills?: readonly ProjectSkill[] } = {},
): SlashCommand[] {
  return fuzzyFilter(allSlash(project, options), query, (command) => command.name)
}

/** Whether this text names a command that exists.
 *
 *  Anything else is a literal message: someone who types `/shrug` meant to say
 *  `/shrug`, and swallowing it would lose what they wrote. */
export function resolveSlash(
  text: string,
  project: readonly ProjectCommand[] = [],
  options: { hasThread?: boolean; skills?: readonly ProjectSkill[] } = {},
): SlashCommand | null {
  const query = slashQuery(text.trim())
  if (query === null) return null

  // `find` over built-ins first is the same rule the menu's order states: a
  // typed `/commit` is the app's, whatever the repository ships.
  return allSlash(project, options).find((command) => command.name === `/${query}`) ?? null
}
