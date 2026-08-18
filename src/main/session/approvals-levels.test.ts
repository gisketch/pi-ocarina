/** The gate at each level. The rest of the gate's behaviour is in
 *  `approvals.test.ts`, which says nothing about levels and so describes what
 *  `ask` still does. */

import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import type { PermissionLevel } from '../../shared/permissions'
import { ApprovalGate, type ApprovalRules } from './approvals'

const CWD = '/w/repo'

function harness(level: PermissionLevel, approved: string[] = []) {
  const events: { threadId: string; event: UiEvent }[] = []
  const rules: ApprovalRules = {
    hasApproval: (_workspaceId, key) => approved.includes(key),
    addApproval: () => {},
    removeApproval: () => {},
    listApprovals: () => approved,
  }
  const gate = new ApprovalGate((threadId, event) => events.push({ threadId, event }), rules, {
    levelFor: () => level,
    pathFor: () => CWD,
  })
  return { gate, events }
}

/** Whether the call ran without a card. Never awaited when it asks — the gate's
 *  promise stays open until someone answers, which is the point. */
async function ranQuietly(
  gate: ApprovalGate,
  toolName: string,
  input: unknown,
): Promise<boolean> {
  const verdict = await Promise.race([
    gate.request({ threadId: 't1', workspaceId: 'w1', toolName, input }).then(() => 'ran'),
    Promise.resolve().then(() => 'asked'),
  ])
  return verdict === 'ran'
}

describe('full access', () => {
  it('never asks about anything', async () => {
    const { gate, events } = harness('full')
    for (const call of [
      ['bash', { command: 'rm -rf /' }],
      ['write', { path: '/etc/hosts' }],
      ['edit', { path: '.git/config' }],
      ['fetch', { url: 'https://x.test', method: 'POST' }],
    ] as const) {
      expect(await ranQuietly(gate, call[0], call[1])).toBe(true)
    }
    expect(events).toEqual([])
  })
})

describe('ask', () => {
  it('asks about everything gated, which is what it did before levels existed', async () => {
    const { gate, events } = harness('ask')
    expect(await ranQuietly(gate, 'bash', { command: 'pnpm test' })).toBe(false)
    expect(await ranQuietly(gate, 'write', { path: 'src/a.ts' })).toBe(false)
    expect(events).toHaveLength(2)
  })

  it('still honours a remembered yes', async () => {
    const { gate } = harness('ask', ['bash:pnpm'])
    expect(await ranQuietly(gate, 'bash', { command: 'pnpm test' })).toBe(true)
  })
})

describe('auto', () => {
  it('runs ordinary work in the workspace', async () => {
    const { gate, events } = harness('auto')
    expect(await ranQuietly(gate, 'bash', { command: 'pnpm test' })).toBe(true)
    expect(await ranQuietly(gate, 'write', { path: 'src/a.ts' })).toBe(true)
    expect(await ranQuietly(gate, 'fetch', { url: 'https://x.test' })).toBe(true)
    expect(events).toEqual([])
  })

  it('asks about what leaves the workspace or cannot be undone', async () => {
    const { gate, events } = harness('auto')
    expect(await ranQuietly(gate, 'bash', { command: 'rm -rf build' })).toBe(false)
    expect(await ranQuietly(gate, 'bash', { command: 'git push' })).toBe(false)
    expect(await ranQuietly(gate, 'write', { path: '.env' })).toBe(false)
    expect(await ranQuietly(gate, 'write', { path: '/tmp/x' })).toBe(false)
    expect(events).toHaveLength(4)
  })

  it('honours a remembered yes for something it would otherwise ask about', async () => {
    const { gate } = harness('auto', ['bash:git'])
    expect(await ranQuietly(gate, 'bash', { command: 'git push' })).toBe(true)
  })

  it('asks about everything when the workspace has no known directory', async () => {
    // An unknown boundary means the rule cannot judge anything, so it does not.
    const events: { threadId: string; event: UiEvent }[] = []
    const gate = new ApprovalGate(
      (threadId, event) => events.push({ threadId, event }),
      { hasApproval: () => false, addApproval: () => {}, removeApproval: () => {}, listApprovals: () => [] },
      { levelFor: () => 'auto', pathFor: () => null },
    )
    expect(await ranQuietly(gate, 'bash', { command: 'pnpm test' })).toBe(false)
  })
})

describe('a thread override', () => {
  it('beats its workspace', () => {
    const { gate } = harness('ask')
    expect(gate.levelFor('t1', 'w1')).toBe('ask')

    gate.setThreadLevel('t1', 'full')
    expect(gate.levelFor('t1', 'w1')).toBe('full')
    expect(gate.levelFor('t2', 'w1')).toBe('ask')
  })

  it('is cleared back to the workspace, and forgotten with the thread', () => {
    const { gate } = harness('auto')
    gate.setThreadLevel('t1', 'ask')
    gate.setThreadLevel('t1', undefined)
    expect(gate.threadLevel('t1')).toBeUndefined()

    gate.setThreadLevel('t1', 'full')
    gate.forgetThread('t1')
    expect(gate.levelFor('t1', 'w1')).toBe('auto')
  })

  it('changes what runs, not only what is reported', async () => {
    const { gate, events } = harness('ask')
    gate.setThreadLevel('t1', 'full')
    expect(await ranQuietly(gate, 'bash', { command: 'rm -rf build' })).toBe(true)
    expect(events).toEqual([])
  })
})
