import { describe, expect, it, vi } from 'vitest'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { handleProject, type ProjectDeps } from './project-commands'
import type { Sdk } from './workspaces'

const skills = (names: string[]) => ({
  skills: names.map((name) => ({ name, filePath: `/repo/.pi/skills/${name}/SKILL.md` })),
  diagnostics: [],
})

function fake(options: { streaming?: boolean; onReload?: () => void } = {}) {
  let loaded = ['reviewer']
  const rebuilt: string[][] = []
  const session = {
    isStreaming: options.streaming ?? false,
    resourceLoader: {
      getSkills: () => skills(loaded),
      reload: async () => {
        options.onReload?.()
        loaded = ['reviewer', 'scout']
      },
    },
    getActiveToolNames: () => ['read', 'bash'],
    setActiveToolsByName: (names: string[]) => rebuilt.push(names),
  } as unknown as AgentSession

  const deps: ProjectDeps = {
    session: () => session,
    cwdOf: () => '/repo',
    sdk: async () => ({ getAgentDir: () => '/home/me/.pi' }) as unknown as Sdk,
  }
  return { deps, session, rebuilt }
}

describe('reading the surface', () => {
  it('returns what is loaded without re-reading disk', async () => {
    const onReload = vi.fn()
    const { deps } = fake({ onReload })

    const answer = (await handleProject(deps, 'projectSurface', { threadId: 't1' })) as {
      surface: { skills: unknown[] }
    }

    expect(answer.surface.skills).toHaveLength(1)
    expect(onReload).not.toHaveBeenCalled()
  })
})

describe('reloading', () => {
  it('re-reads and answers with the new surface', async () => {
    const { deps } = fake()

    const answer = (await handleProject(deps, 'reloadProject', { threadId: 't1' })) as {
      reloaded: boolean
      surface: { skills: unknown[] }
    }

    expect(answer.reloaded).toBe(true)
    expect(answer.surface.skills).toHaveLength(2)
  })

  it('refuses while the thread is working, and says why', async () => {
    const onReload = vi.fn()
    const { deps } = fake({ streaming: true, onReload })

    const answer = (await handleProject(deps, 'reloadProject', { threadId: 't1' })) as {
      reloaded: boolean
      because: string
    }

    // Refused, not queued: pi builds the system prompt per request, so a reload
    // landing mid-turn changes the agent's instructions between turns.
    expect(answer.reloaded).toBe(false)
    expect(answer.because).toContain('working')
    expect(onReload).not.toHaveBeenCalled()
  })

  it('rebuilds the session prompt, not only the loader', async () => {
    // pi caches the assembled prompt. Reloading the loader alone leaves the
    // agent running on the skills and instructions it was born with, and
    // `/reload` would report success for nothing.
    const { deps, rebuilt } = fake()

    await handleProject(deps, 'reloadProject', { threadId: 't1' })
    expect(rebuilt).toEqual([['read', 'bash']])
  })

  it('survives a loader that cannot reload', async () => {
    const deps: ProjectDeps = {
      session: () => ({ isStreaming: false, resourceLoader: {} }) as unknown as AgentSession,
      cwdOf: () => '/repo',
      sdk: async () => ({ getAgentDir: () => '/home/me/.pi' }) as unknown as Sdk,
    }

    const answer = (await handleProject(deps, 'reloadProject', { threadId: 't1' })) as {
      reloaded: boolean
    }
    expect(answer.reloaded).toBe(true)
  })
})
