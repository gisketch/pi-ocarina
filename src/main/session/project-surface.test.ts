import { describe, expect, it } from 'vitest'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { readSurface } from './project-surface'

/** `readSurface` takes the loader itself now, because a surface is a property
 *  of a folder and a workspace with no thread open still has one. */
const sessionWith = (loader: unknown): unknown => loader

const WHERE = { cwd: '/repo', agentDir: '/home/me/.pi', appDir: '/app/resources' }

const FULL = {
  getPrompts: () => ({
    prompts: [{ name: 'ship', description: 'run checks', filePath: '/repo/.pi/prompts/ship.md' }],
    diagnostics: [{ path: '/repo/.pi/prompts/bad.md', message: 'no frontmatter' }],
  }),
  getSkills: () => ({
    skills: [
      {
        name: 'reviewer',
        description: 'reviews',
        filePath: '/repo/.pi/skills/reviewer/SKILL.md',
        disableModelInvocation: true,
      },
      {
        name: 'creator',
        description: 'writes skills',
        filePath: '/app/resources/skills/creator/SKILL.md',
      },
    ],
    diagnostics: [],
  }),
  getAgentsFiles: () => ({ agentsFiles: [{ path: '/repo/AGENTS.md', content: '# Agents' }] }),
  getSystemPromptSource: () => ({ path: '/repo/.pi/system.md' }),
}

describe('reading what a loader loaded', () => {
  it('reads every getter pi exposes', () => {
    const surface = readSurface(sessionWith(FULL), WHERE)

    expect(surface.commands).toEqual([
      {
        name: 'ship',
        description: 'run checks',
        source: 'project',
        path: '/repo/.pi/prompts/ship.md',
      },
    ])
    expect(surface.skills.map((one) => [one.name, one.source, one.explicitOnly])).toEqual([
      ['reviewer', 'project', true],
      ['creator', 'app', false],
    ])
    expect(surface.instructionFiles).toEqual([{ path: '/repo/AGENTS.md', content: '# Agents' }])
    expect(surface.systemPromptSource).toBe('/repo/.pi/system.md')
  })

  it('collects diagnostics from every getter that has them', () => {
    expect(readSurface(sessionWith(FULL), WHERE).problems).toEqual([
      { path: '/repo/.pi/prompts/bad.md', message: 'no frontmatter' },
    ])
  })

  it('reads nothing from a session with no loader', () => {
    const surface = readSurface(sessionWith(undefined), WHERE)
    expect(surface.skills).toEqual([])
    expect(surface.problems).toEqual([])
  })

  it('survives a loader that is missing a getter', () => {
    // A stub session in a test, or a pi release that drops one.
    const surface = readSurface(sessionWith({ getSkills: FULL.getSkills }), WHERE)
    expect(surface.skills).toHaveLength(2)
    expect(surface.commands).toEqual([])
    expect(surface.systemPromptSource).toBeUndefined()
  })

  it('survives a getter that throws', () => {
    const surface = readSurface(
      sessionWith({
        ...FULL,
        getSkills: () => {
          throw new Error('the skills directory vanished')
        },
      }),
      WHERE,
    )
    expect(surface.skills).toEqual([])
    // The rest still loaded, which is the whole point of per-resource reading.
    expect(surface.commands).toHaveLength(1)
  })

  it('does not invent fields a resource left out', () => {
    const surface = readSurface(
      sessionWith({ getSkills: () => ({ skills: [{ filePath: '/repo/a/SKILL.md' }] }) }),
      WHERE,
    )
    expect(surface.skills[0]).toEqual({
      name: '',
      description: '',
      source: 'project',
      path: '/repo/a/SKILL.md',
      explicitOnly: false,
    })
  })

  it('reports a diagnostic with no message rather than dropping it', () => {
    const surface = readSurface(
      sessionWith({ getSkills: () => ({ skills: [], diagnostics: [{ path: '/x' }] }) }),
      WHERE,
    )
    expect(surface.problems).toEqual([{ path: '/x', message: 'this file could not be read' }])
  })
})
