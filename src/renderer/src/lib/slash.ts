import { fuzzyFilter } from './fuzzy'

export type SlashId = 'compact' | 'model'

export interface SlashCommand {
  id: SlashId
  name: string
  description: string
}

/** What `/` offers.
 *
 *  Only commands that do something. The spec also lists `/commit` and
 *  `/context`; the first needs the git pipeline (E plan) and the second needs a
 *  context breakdown surface that does not exist yet. Both are omitted rather
 *  than listed as menu entries that would do nothing when picked. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: 'compact', name: '/compact', description: 'summarize thread, free context' },
  { id: 'model', name: '/model', description: 'switch model / reasoning' },
]

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

export function filterSlash(query: string): SlashCommand[] {
  return fuzzyFilter(SLASH_COMMANDS, query, (command) => command.name)
}

/** Whether this text names a command that exists.
 *
 *  Anything else is a literal message: someone who types `/shrug` meant to say
 *  `/shrug`, and swallowing it would lose what they wrote. */
export function resolveSlash(text: string): SlashCommand | null {
  const query = slashQuery(text.trim())
  if (query === null) return null

  return SLASH_COMMANDS.find((command) => command.name === `/${query}`) ?? null
}
