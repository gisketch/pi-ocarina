import { describe, expect, it } from 'vitest'
import { ApprovalGate } from './approvals'
import { AskGate } from './ask-gate'
import { SessionFactory } from './session-factory'

/** The rebinding step, which exists because pi 0.84 builds its tools against
 *  `process.cwd()` rather than the session's.
 *
 *  It is tested here because it was also, silently, the place a child's tool
 *  ceiling was undone: it put every built-in back regardless of what the
 *  session had been narrowed to. */
function factory(): SessionFactory {
  const rules = {
    hasApproval: () => false,
    addApproval: () => {},
    removeApproval: () => {},
    listApprovals: () => [],
  }
  return new SessionFactory(new ApprovalGate(() => {}, rules), new AskGate(() => {}))
}

function sessionHolding(names: string[]): { agent: { state: { tools: { name: string }[] } } } {
  return { agent: { state: { tools: names.map((name) => ({ name })) } } }
}

describe('binding the built-in tools to a workspace', () => {
  it('gives a thread every built-in', async () => {
    const session = sessionHolding([])
    await factory().bindToolsToWorkspace(session as never, '/repo')

    const names = session.agent.state.tools.map((tool) => tool.name).sort()
    expect(names).toEqual(['bash', 'edit', 'find', 'grep', 'ls', 'read', 'write'])
  })

  it('never hands a child a tool its role withheld', async () => {
    // The whole of decision 13: a role's tool set is a ceiling. Before this,
    // rebinding put write, edit and bash back under every read-only child.
    const session = sessionHolding([])
    await factory().bindToolsToWorkspace(session as never, '/repo', ['read', 'grep', 'find', 'ls'])

    const names = session.agent.state.tools.map((tool) => tool.name).sort()
    expect(names).toEqual(['find', 'grep', 'ls', 'read'])
    expect(names).not.toContain('write')
    expect(names).not.toContain('bash')
  })

  it('removes a withheld tool that the session already held', async () => {
    const session = sessionHolding(['bash', 'read'])
    await factory().bindToolsToWorkspace(session as never, '/repo', ['read'])

    expect(session.agent.state.tools.map((tool) => tool.name)).toEqual(['read'])
  })

  it('leaves extension tools alone, whatever the ceiling says', async () => {
    // They bind their own cwd, and a ceiling names built-ins.
    const session = sessionHolding(['spawn_agents', 'ask_user'])
    await factory().bindToolsToWorkspace(session as never, '/repo', ['read'])

    const names = session.agent.state.tools.map((tool) => tool.name)
    expect(names).toContain('spawn_agents')
    expect(names).toContain('ask_user')
  })

  it('gives a child nothing at all when its role holds nothing', async () => {
    const session = sessionHolding([])
    await factory().bindToolsToWorkspace(session as never, '/repo', [])

    expect(session.agent.state.tools).toEqual([])
  })
})
