import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLES } from '../../shared/agent-roles'
import type { AgentEntry } from '../../shared/vocabulary'
import { MAX_PER_CALL, type AgentFleet } from './agent-fleet'
import { spawnAgentsTool, type SpawnDeps } from './spawn-tool'

function toolWith(run?: SpawnDeps['fleet']['run']) {
  const started: unknown[] = []
  const fleet = {
    run:
      run ??
      (async (_parent, plan) => {
        started.push(plan)
        return { id: 'c1', name: 'odysseus', role: plan.role, label: plan.label } as AgentEntry
      }),
  } as unknown as AgentFleet

  return {
    started,
    tool: spawnAgentsTool({
      fleet,
      handle: { threadId: 't1' },
      roles: () => [...DEFAULT_ROLES],
      names: () => ['odysseus'],
      where: () => ({ workspaceId: 'w1', cwd: '/repo' }),
      depth: 0,
    }),
  }
}

async function call(tool: ReturnType<typeof spawnAgentsTool>, agents: unknown[]) {
  const result = await tool.execute('spawn-1', { agents } as never, undefined)
  return JSON.parse(result.content[0].text)
}

const scout = { role: 'scout', task: 'find it', label: 'find retry' }

describe('what the tool refuses', () => {
  it('refuses an empty fan-out', async () => {
    const { tool } = toolWith()
    expect((await call(tool, [])).error).toContain('needs an agent')
  })

  it('refuses more children than one call may start', async () => {
    const { tool, started } = toolWith()
    const many = Array.from({ length: MAX_PER_CALL + 1 }, () => scout)

    const result = await call(tool, many)
    expect(result.error).toContain(String(MAX_PER_CALL))
    // And nothing ran: half a fan-out is worse than none.
    expect(started).toHaveLength(0)
  })

  it('refuses the whole call when one child names a role that does not exist', async () => {
    const { tool, started } = toolWith()
    const result = await call(tool, [scout, { ...scout, role: 'archaeologist' }])

    expect(result.error).toContain('archaeologist')
    expect(started).toHaveLength(0)
  })
})

describe('what the parent reads back', () => {
  it('returns one entry per child', async () => {
    const { tool } = toolWith()
    const result = await call(tool, [scout, { ...scout, role: 'planner', label: 'plan it' }])

    expect(result.agents.map((one: AgentEntry) => one.role)).toEqual(['scout', 'planner'])
  })

  it('carries a dropped tool through as a warning rather than silently', async () => {
    const { tool } = toolWith()
    const result = await call(tool, [{ ...scout, role: 'planner', tools: ['read', 'write'] }])

    expect(result.warnings.join(' ')).toContain('write')
  })

  it('says nothing when nothing was refused', async () => {
    const { tool } = toolWith()
    expect((await call(tool, [scout])).warnings).toBeUndefined()
  })
})

describe('what the model is shown', () => {
  it('lists the configured roles, because it cannot name one it has never seen', () => {
    const { tool } = toolWith()
    for (const role of DEFAULT_ROLES) expect(tool.description).toContain(role.name)
  })

  it('says so plainly when there are none, and points at the inline path', () => {
    const bare = spawnAgentsTool({
      fleet: {} as unknown as AgentFleet,
      handle: { threadId: 't1' },
      roles: () => [],
      names: () => [],
      where: () => ({ workspaceId: 'w1', cwd: '/repo' }),
      depth: 0,
    })
    expect(bare.description).toContain('No roles are configured')
    expect(bare.description).toContain('read-only')
  })
})
