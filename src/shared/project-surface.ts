/** What this workspace told the agent, and what it gave it to work with.
 *
 *  Everything here is read. pi's `ResourceLoader` already holds the commands,
 *  the skills and the instruction files — this app discovers nothing and loads
 *  nothing, it only puts what was loaded where a reader can see it.
 *
 *  Shared because both sides speak it: main reads it off the loader, and the
 *  workspace screen draws it. */

/** Where something came from, and therefore how much the reader should trust
 *  a name in it. */
export type SurfaceSource = 'project' | 'global' | 'app'

export interface ProjectCommand {
  name: string
  description: string
  source: SurfaceSource
  path: string
}

export interface ProjectSkill {
  name: string
  description: string
  source: SurfaceSource
  path: string
  /** Hidden from the system prompt, so only an explicit `/skill:name` runs it. */
  explicitOnly: boolean
}

export interface InstructionFile {
  path: string
  content: string
}

/** A file that failed to load, and the reason. pi reports these per resource,
 *  which is what lets one broken skill leave its neighbours working. */
export interface SurfaceProblem {
  path: string
  message: string
}

export interface ProjectSurface {
  commands: ProjectCommand[]
  skills: ProjectSkill[]
  instructionFiles: InstructionFile[]
  /** The file that became the system prompt, when a file did. */
  systemPromptSource?: string
  problems: SurfaceProblem[]
}

export const EMPTY_SURFACE: ProjectSurface = {
  commands: [],
  skills: [],
  instructionFiles: [],
  problems: [],
}

/** Where a path sits relative to this workspace.
 *
 *  A reader deciding whether to trust a skill wants to know whether it came
 *  with the repository they cloned or from their own machine. `app` is this
 *  app's own shipped resources, which is neither. */
export function sourceOf(path: string, cwd: string, agentDir: string, appDir: string): SurfaceSource {
  if (appDir !== '' && path.startsWith(appDir)) return 'app'
  if (cwd !== '' && path.startsWith(cwd)) return 'project'
  if (agentDir !== '' && path.startsWith(agentDir)) return 'global'
  // Outside all three. Global is the honest answer: it is on this machine and
  // it did not come with the repository.
  return 'global'
}

/** Whether the workspace loaded anything at all worth a section. */
export function surfaceIsEmpty(surface: ProjectSurface): boolean {
  return (
    surface.commands.length === 0 &&
    surface.skills.length === 0 &&
    surface.instructionFiles.length === 0 &&
    surface.problems.length === 0 &&
    surface.systemPromptSource === undefined
  )
}

/** The count each group's heading shows. Plural forms are written out rather
 *  than made by appending an `s`: `2 skills` is right and `2 commands` is
 *  right, but the app has already shipped `2 searchs` once. */
export function countOf(kind: 'command' | 'skill' | 'file' | 'problem', n: number): string {
  const words: Record<string, [string, string]> = {
    command: ['command', 'commands'],
    skill: ['skill', 'skills'],
    file: ['file', 'files'],
    problem: ['problem', 'problems'],
  }
  const [one, many] = words[kind]
  return `${n} ${n === 1 ? one : many}`
}
