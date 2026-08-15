import { describe, expect, it, vi } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { ApprovalGate, describeCall, needsApproval, ruleKey, type ApprovalRules } from './approvals'

/** A rules store with nothing behind it, so the gate is tested on its own. */
function rules(seed: Record<string, string[]> = {}): ApprovalRules & { state: Record<string, string[]> } {
  const state: Record<string, string[]> = structuredClone(seed)
  return {
    state,
    hasApproval: (workspaceId, key) => state[workspaceId]?.includes(key) ?? false,
    addApproval: (workspaceId, key) => {
      state[workspaceId] = [...(state[workspaceId] ?? []), key]
    },
    removeApproval: (workspaceId, key) => {
      state[workspaceId] = (state[workspaceId] ?? []).filter((candidate) => candidate !== key)
    },
    listApprovals: (workspaceId) => state[workspaceId] ?? [],
  }
}

function gate(seed: Record<string, string[]> = {}): {
  gate: ApprovalGate
  events: { threadId: string; event: UiEvent }[]
  store: ReturnType<typeof rules>
} {
  const events: { threadId: string; event: UiEvent }[] = []
  const store = rules(seed)
  return {
    gate: new ApprovalGate((threadId, event) => events.push({ threadId, event }), store),
    events,
    store,
  }
}

const bash = (command: string) => ({ toolName: 'bash', input: { command } })

describe('needsApproval', () => {
  it('gates the tools that change things', () => {
    expect(needsApproval('bash')).toBe(true)
    expect(needsApproval('write')).toBe(true)
    expect(needsApproval('edit')).toBe(true)
  })

  it('lets reading happen without interrupting anyone', () => {
    for (const tool of ['read', 'grep', 'find', 'ls']) expect(needsApproval(tool)).toBe(false)
  })
})

describe('ruleKey', () => {
  it('remembers a file tool by name', () => {
    expect(ruleKey('write', { path: 'a.ts' })).toBe('write')
  })

  it('remembers bash by program, never as a blanket permission', () => {
    expect(ruleKey('bash', { command: 'pnpm install --frozen-lockfile' })).toBe('bash:pnpm')
    expect(ruleKey('bash', { command: 'rm -rf /' })).toBe('bash:rm')
  })

  it('does not let two different programs share a rule', () => {
    expect(ruleKey('bash', { command: 'pnpm test' })).not.toBe(ruleKey('bash', { command: 'rm x' }))
  })

  it('falls back to an unusable key when there is no command', () => {
    expect(ruleKey('bash', {})).toBe('bash:?')
    expect(ruleKey('bash', undefined)).toBe('bash:?')
  })

  it('will not let a chained command be remembered by its harmless first word', () => {
    // Approving this must not become "always allow anything starting with cd".
    const chained = ruleKey('bash', { command: 'cd /tmp && rm -rf *' })

    expect(chained).not.toBe('bash:cd')
    expect(chained).not.toBe(ruleKey('bash', { command: 'cd /tmp' }))
  })

  it.each([
    'echo hi; rm -rf /',
    'echo `rm -rf /`',
    'echo $(rm -rf /)',
    'cat a | sh',
    'echo x > /etc/hosts',
    'echo a\nrm -rf /',
  ])('treats %j as a command that only matches itself', (command) => {
    expect(ruleKey('bash', { command })).toBe(`bash=${command}`)
  })

  it('still keys a plain command by its program, so the rule is reusable', () => {
    expect(ruleKey('bash', { command: 'pnpm run build --force' })).toBe('bash:pnpm')
  })
})

describe('describeCall', () => {
  it('shows the command for bash', () => {
    expect(describeCall('bash', { command: 'pnpm install' })).toBe('pnpm install')
  })

  it('shows the tool and path for file tools', () => {
    expect(describeCall('write', { path: 'src/a.ts' })).toBe('write src/a.ts')
  })
})

describe('ApprovalGate', () => {
  it('lets an ungated tool straight through without asking', async () => {
    const { gate: approvals, events } = gate()

    const verdict = await approvals.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolName: 'read',
      input: { path: 'a.ts' },
    })

    expect(verdict.blocked).toBe(false)
    expect(events).toEqual([])
  })

  it('asks before a gated tool runs, and waits', async () => {
    const { gate: approvals, events } = gate()
    const settled = vi.fn()

    void approvals
      .request({ threadId: 't1', workspaceId: 'w1', ...bash('pnpm install') })
      .then(settled)
    await Promise.resolve()

    expect(events[0].event).toMatchObject({ kind: 'approve', command: 'pnpm install' })
    expect(settled).not.toHaveBeenCalled()
    expect(approvals.pendingCount).toBe(1)
  })

  it('allow-once lets this call run and remembers nothing', async () => {
    const { gate: approvals, events, store } = gate()

    const pending = approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('pnpm install') })
    await Promise.resolve()
    approvals.resolve(id(events), 'allow-once')

    expect((await pending).blocked).toBe(false)
    expect(store.state).toEqual({})
  })

  it('always remembers the rule for next time', async () => {
    const { gate: approvals, events, store } = gate()

    const pending = approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('pnpm install') })
    await Promise.resolve()
    approvals.resolve(id(events), 'always')

    expect((await pending).blocked).toBe(false)
    expect(store.state.w1).toEqual(['bash:pnpm'])
  })

  it('deny blocks the call and says why', async () => {
    const { gate: approvals, events } = gate()

    const pending = approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('rm -rf /') })
    await Promise.resolve()
    approvals.resolve(id(events), 'deny')

    const verdict = await pending
    expect(verdict.blocked).toBe(true)
    expect(verdict.reason).toMatch(/denied/)
  })

  it('a remembered rule does not ask again', async () => {
    const { gate: approvals, events } = gate({ w1: ['bash:pnpm'] })

    const verdict = await approvals.request({
      threadId: 't1',
      workspaceId: 'w1',
      ...bash('pnpm test'),
    })

    expect(verdict.blocked).toBe(false)
    expect(events).toEqual([])
  })

  it('a rule in one workspace never leaks into another', async () => {
    const { gate: approvals, events } = gate({ w1: ['bash:pnpm'] })

    void approvals.request({ threadId: 't1', workspaceId: 'w2', ...bash('pnpm test') })
    await Promise.resolve()

    expect(events[0].event.kind).toBe('approve')
  })

  it('allowing one program does not allow a different one', async () => {
    const { gate: approvals, events } = gate({ w1: ['bash:pnpm'] })

    void approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('rm -rf /') })
    await Promise.resolve()

    expect(events[0].event).toMatchObject({ kind: 'approve', command: 'rm -rf /' })
  })

  it('reports the outcome so the ledger can show it', async () => {
    const { gate: approvals, events } = gate()

    void approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('pnpm install') })
    await Promise.resolve()
    approvals.resolve(id(events), 'deny')

    expect(events[1].event).toMatchObject({ kind: 'approve-resolved', outcome: 'deny' })
    expect(events[1].threadId).toBe('t1')
  })

  it('ignores an answer to something that is not pending', () => {
    const { gate: approvals, events } = gate()

    expect(() => approvals.resolve('approve-999', 'always')).not.toThrow()
    expect(events).toEqual([])
  })

  it('answering twice does not resolve a later request by accident', async () => {
    const { gate: approvals, events, store } = gate()

    const pending = approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('pnpm install') })
    await Promise.resolve()
    const approvalId = id(events)
    approvals.resolve(approvalId, 'allow-once')
    approvals.resolve(approvalId, 'always')

    await pending
    expect(store.state).toEqual({})
  })

  it('remembers which call it blocked, so the row can read "denied"', async () => {
    const { gate: approvals, events } = gate()

    const pending = approvals.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolCallId: 'call-7',
      ...bash('rm -rf /'),
    })
    await Promise.resolve()
    approvals.resolve(id(events), 'deny')
    await pending

    expect(approvals.takeBlocked('call-7')).toBe(true)
  })

  it('reports a blocked call once, then forgets it', async () => {
    const { gate: approvals, events } = gate()

    const pending = approvals.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolCallId: 'call-7',
      ...bash('rm -rf /'),
    })
    await Promise.resolve()
    approvals.resolve(id(events), 'deny')
    await pending

    expect(approvals.takeBlocked('call-7')).toBe(true)
    expect(approvals.takeBlocked('call-7')).toBe(false)
  })

  it('does not mark an allowed call as blocked', async () => {
    const { gate: approvals, events } = gate()

    const pending = approvals.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolCallId: 'call-8',
      ...bash('pnpm install'),
    })
    await Promise.resolve()
    approvals.resolve(id(events), 'allow-once')
    await pending

    expect(approvals.takeBlocked('call-8')).toBe(false)
  })

  it('marks a call abandoned by a closing thread as blocked too', async () => {
    const { gate: approvals } = gate()

    const pending = approvals.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolCallId: 'call-9',
      ...bash('pnpm install'),
    })
    await Promise.resolve()
    approvals.abandon('t1')
    await pending

    expect(approvals.takeBlocked('call-9')).toBe(true)
  })

  it('closing a thread releases its waiting calls instead of hanging the agent', async () => {
    const { gate: approvals } = gate()

    const pending = approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('pnpm install') })
    await Promise.resolve()
    approvals.abandon('t1')

    const verdict = await pending
    expect(verdict.blocked).toBe(true)
    expect(approvals.pendingCount).toBe(0)
  })

  it('closing one thread leaves another thread waiting', async () => {
    const { gate: approvals } = gate()

    void approvals.request({ threadId: 't1', workspaceId: 'w1', ...bash('a') })
    void approvals.request({ threadId: 't2', workspaceId: 'w1', ...bash('b') })
    await Promise.resolve()
    approvals.abandon('t1')

    expect(approvals.pendingCount).toBe(1)
  })
})

/** The id of the most recent approve event. */
function id(events: { event: UiEvent }[]): string {
  const approve = [...events].reverse().find((entry) => entry.event.kind === 'approve')
  if (approve?.event.kind !== 'approve') throw new Error('no approval was requested')
  return approve.event.id
}
