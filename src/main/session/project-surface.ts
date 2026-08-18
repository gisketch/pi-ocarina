/** Reading pi's resource loader into the shape the workspace screen draws.
 *
 *  Main-side because it touches a live session and pi's own types. The reading
 *  is dull on purpose: every field comes from a getter pi already exposes, and
 *  nothing here goes looking at the filesystem. If a skill is missing from this
 *  list, it is missing from the agent's system prompt too. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import {
  EMPTY_SURFACE,
  sourceOf,
  type ProjectSurface,
  type SurfaceProblem,
} from '../../shared/project-surface'

/** pi's diagnostics, read structurally. The shape is stable enough to read and
 *  not stable enough to import a type for. */
function problemsOf(diagnostics: unknown): SurfaceProblem[] {
  if (!Array.isArray(diagnostics)) return []
  return diagnostics.map((one) => {
    const record = (one ?? {}) as Record<string, unknown>
    const path = typeof record.path === 'string' ? record.path : ''
    const message =
      typeof record.message === 'string' ? record.message : 'this file could not be read'
    return { path, message }
  })
}

export interface SurfaceContext {
  cwd: string
  agentDir: string
  /** This app's own shipped resources, so a skill it ships is not mistaken for
   *  one the reader wrote. */
  appDir: string
}

/** Everything this session loaded, in one object.
 *
 *  Returns the empty surface rather than throwing when pi's loader is not the
 *  default one — a stub session in a test has no resources, and a screen that
 *  says "nothing loaded" is right about that. */
export function readSurface(session: AgentSession, where: SurfaceContext): ProjectSurface {
  const loader = session.resourceLoader as unknown as Record<string, unknown> | undefined
  if (!loader) return EMPTY_SURFACE

  const call = <T>(name: string, fallback: T): T => {
    const method = loader[name]
    if (typeof method !== 'function') return fallback
    try {
      return (method as () => T).call(loader)
    } catch {
      return fallback
    }
  }

  const source = (path: string) => sourceOf(path, where.cwd, where.agentDir, where.appDir)

  const prompts = call<{ prompts?: unknown[]; diagnostics?: unknown }>('getPrompts', {})
  const skills = call<{ skills?: unknown[]; diagnostics?: unknown }>('getSkills', {})
  const agentsFiles = call<{ agentsFiles?: unknown[] }>('getAgentsFiles', {})
  const promptSource = call<{ path?: string } | undefined>('getSystemPromptSource', undefined)

  return {
    commands: (prompts.prompts ?? []).map((one) => {
      const it = (one ?? {}) as Record<string, unknown>
      const path = typeof it.filePath === 'string' ? it.filePath : ''
      return {
        name: typeof it.name === 'string' ? it.name : '',
        description: typeof it.description === 'string' ? it.description : '',
        source: source(path),
        path,
      }
    }),
    skills: (skills.skills ?? []).map((one) => {
      const it = (one ?? {}) as Record<string, unknown>
      const path = typeof it.filePath === 'string' ? it.filePath : ''
      return {
        name: typeof it.name === 'string' ? it.name : '',
        description: typeof it.description === 'string' ? it.description : '',
        source: source(path),
        path,
        explicitOnly: it.disableModelInvocation === true,
      }
    }),
    instructionFiles: (agentsFiles.agentsFiles ?? []).map((one) => {
      const it = (one ?? {}) as Record<string, unknown>
      return {
        path: typeof it.path === 'string' ? it.path : '',
        content: typeof it.content === 'string' ? it.content : '',
      }
    }),
    ...(promptSource?.path ? { systemPromptSource: promptSource.path } : {}),
    problems: [...problemsOf(prompts.diagnostics), ...problemsOf(skills.diagnostics)],
  }
}
