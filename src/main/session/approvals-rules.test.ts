/** The gate with the reader's written rules in front of it. The levels
 *  themselves are in `approvals-levels.test.ts`. */

import { describe, expect, it } from 'vitest'
import type { RuleEntry } from '../../shared/config-file'
import type { UiEvent } from '../../shared/protocol'
import type { PermissionLevel } from '../../shared/permissions'
import { ApprovalGate, type ApprovalRules } from './approvals'

const CWD = '/w/repo'

function harness(level: PermissionLevel, written: RuleEntry[], approved: string[] = []) {
  const events: { threadId: string; event: UiEvent }[] = []
  const remembered: ApprovalRules = {
    hasApproval: (_workspaceId, key) => approved.includes(key),
    addApproval: () => {},
    removeApproval: () => {},
    listApprovals: () => [],
  }
  const gate = new ApprovalGate((threadId, event) => events.push({ threadId, event }), remembered, {
    levelFor: () => level,
    pathFor: () => CWD,
  })
  gate.useRules(() => written)
  return { gate, events }
}

async function ranQuietly(gate: ApprovalGate, toolName: string, input: unknown): Promise<boolean> {
  const verdict = await Promise.race([
    gate.request({ threadId: 't1', workspaceId: 'w1', toolName, input }).then(() => 'ran'),
    Promise.resolve().then(() => 'asked'),
  ])
  return verdict === 'ran'
}

describe('an allow rule', () => {
  it('stops the prompt for the command it covers', async () => {
    const { gate, events } = harness('ask', [
      { effect: 'allow', tool: 'bash', match: 'pnpm test' },
    ])

    expect(await ranQuietly(gate, 'bash', { command: 'pnpm test --run' })).toBe(true)
    expect(events).toEqual([])
  })

  it('leaves everything else asking', async () => {
    const { gate } = harness('ask', [{ effect: 'allow', tool: 'bash', match: 'pnpm test' }])
    expect(await ranQuietly(gate, 'bash', { command: 'rm -rf build' })).toBe(false)
  })

  it('cannot reach a protected path', async () => {
    // The rule is written, matches, and still does not apply: `full access`
    // exists for a reader who wants no questions, and a config file must not
    // be a quieter way to reach it.
    const { gate } = harness('ask', [{ effect: 'allow', tool: 'write', match: '/w/repo/.env' }])
    expect(await ranQuietly(gate, 'write', { path: '/w/repo/.env' })).toBe(false)
  })
})

describe('a deny rule', () => {
  it('asks about something auto would have run silently', async () => {
    const quiet = harness('auto', [])
    expect(await ranQuietly(quiet.gate, 'bash', { command: 'pnpm test' })).toBe(true)

    const { gate } = harness('auto', [{ effect: 'deny', tool: 'bash', match: 'pnpm test' }])
    expect(await ranQuietly(gate, 'bash', { command: 'pnpm test' })).toBe(false)
  })

  it('beats an allow for the same call', async () => {
    const { gate } = harness('ask', [
      { effect: 'allow', tool: 'bash', match: 'git' },
      { effect: 'deny', tool: 'bash', match: 'git push' },
    ])

    expect(await ranQuietly(gate, 'bash', { command: 'git status' })).toBe(true)
    expect(await ranQuietly(gate, 'bash', { command: 'git push origin main' })).toBe(false)
  })
})

describe('a gate nobody gave rules to', () => {
  it('behaves exactly as it did before rules existed', async () => {
    const { gate } = harness('ask', [])
    expect(await ranQuietly(gate, 'bash', { command: 'pnpm test' })).toBe(false)
  })
})

describe('a written deny against a remembered yes', () => {
  it('wins, so a click from months ago cannot defeat a sentence written on purpose', async () => {
    const remembered = harness('ask', [], ['bash:git'])
    expect(await ranQuietly(remembered.gate, 'bash', { command: 'git push' })).toBe(true)

    const { gate } = harness('ask', [{ effect: 'deny', tool: 'bash', match: 'git push' }], [
      'bash:git',
    ])
    expect(await ranQuietly(gate, 'bash', { command: 'git push' })).toBe(false)
  })
})
