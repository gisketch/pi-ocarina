import { describe, expect, it } from 'vitest'
import { CHILD_PREAMBLE, DEFAULT_ROLES } from '../../shared/agent-roles'
import { READ_ONLY_TOOLS, type SpawnRequest } from '../../shared/vocabulary'
import { faultInSpawn, INLINE, planSpawn } from './spawn-plan'

const roles = DEFAULT_ROLES
const ask = (extra: Partial<SpawnRequest> = {}): SpawnRequest => ({
  role: 'scout',
  task: 'find the retry loop',
  label: 'find retry',
  ...extra,
})

describe('a spawn the model asked for badly', () => {
  it('names the roles that exist when it names one that does not', () => {
    const fault = faultInSpawn(ask({ role: 'archaeologist' }), roles)
    expect(fault).toContain('archaeologist')
    expect(fault).toContain('scout')
  })

  it('refuses a task-less agent', () => {
    expect(faultInSpawn(ask({ task: '   ' }), roles)).toBe('every agent needs a task')
  })

  it('refuses one with nothing to put in its row', () => {
    expect(faultInSpawn(ask({ label: '' }), roles)).toContain('short label')
  })

  it('refuses both a role and an inline prompt, rather than picking one silently', () => {
    const fault = faultInSpawn(ask({ instructions: 'you are a bard' }), roles)
    expect(fault).toBe('name a role or give instructions, not both')
  })

  it('refuses neither', () => {
    expect(faultInSpawn({ task: 'go', label: 'go' }, roles)).toContain('name a role')
  })

  it('says so plainly when no roles are configured at all', () => {
    expect(faultInSpawn({ task: 'go', label: 'go' }, [])).toContain('none configured')
  })

  it('passes a well-formed spawn', () => {
    expect(faultInSpawn(ask(), roles)).toBeNull()
  })
})

describe('what a child turns out to be', () => {
  it('takes the role its name resolved to', () => {
    const plan = planSpawn(ask(), roles)
    expect(plan.role).toBe('scout')
  })

  it('leaves a shipped role modelless, so a child borrows the session’s own', () => {
    // A shipped model id is a guess about which providers this machine has
    // credentials for. A wrong guess kills every child of that role.
    for (const role of roles) expect(role.model).toBeUndefined()
  })

  it('always ends its instructions with the preamble, whoever wrote them', () => {
    expect(planSpawn(ask(), roles).instructions).toContain(CHILD_PREAMBLE)
    const inline = planSpawn(
      { task: 'go', label: 'go', instructions: 'you are a bard' },
      roles,
    )
    expect(inline.instructions).toContain('you are a bard')
    expect(inline.instructions).toContain(CHILD_PREAMBLE)
  })

  it('gives an inline prompt the read-only ceiling and calls it inline', () => {
    const plan = planSpawn({ task: 'go', label: 'go', instructions: 'you are a bard' }, roles)
    expect(plan.role).toBe(INLINE)
    expect(plan.tools).toEqual([...READ_ONLY_TOOLS])
  })

  it('lets a spawn narrow a role', () => {
    const plan = planSpawn(ask({ tools: ['read'] }), roles)
    expect(plan.tools).toEqual(['read'])
    expect(plan.warnings).toEqual([])
  })

  it('drops a tool the role never had, and says it did', () => {
    const plan = planSpawn(ask({ role: 'planner', tools: ['read', 'write'] }), roles)
    expect(plan.tools).toEqual(['read'])
    expect(plan.warnings.join(' ')).toContain('write')
  })

  it('will not let an inline prompt reach a writing tool', () => {
    const plan = planSpawn(
      { task: 'go', label: 'go', instructions: 'you are a bard', tools: ['write', 'bash'] },
      roles,
    )
    expect(plan.tools).toEqual([])
    expect(plan.warnings.join(' ')).toContain('write')
  })

  it('lets the spawn override the role model', () => {
    expect(planSpawn(ask({ model: 'openai/gpt-5.4-mini' }), roles).model).toBe('openai/gpt-5.4-mini')
  })

  it('leaves the model unset when neither names one, so the parent lends its own', () => {
    expect(planSpawn(ask({ role: 'planner' }), roles).model).toBeUndefined()
  })
})
