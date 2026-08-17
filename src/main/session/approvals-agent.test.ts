/** Cards raised by a child agent rather than by the thread itself.
 *
 *  Split from `approvals.test.ts` so the gate's own rules and the fan-out's use
 *  of them stay readable apart. */

import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { ApprovalGate, ruleKey, type ApprovalRules } from './approvals'

function rules(seed: Record<string, string[]> = {}): ApprovalRules {
  const state: Record<string, string[]> = { ...seed }
  return {
    hasApproval: (workspaceId, key) => (state[workspaceId] ?? []).includes(key),
    addApproval: (workspaceId, key) => {
      state[workspaceId] = [...(state[workspaceId] ?? []), key]
    },
    removeApproval: (workspaceId, key) => {
      state[workspaceId] = (state[workspaceId] ?? []).filter((one) => one !== key)
    },
    listApprovals: (workspaceId) => [...(state[workspaceId] ?? [])],
  }
}

describe('a card raised by a child agent', () => {
  it('names who is asking, because four running children make it unanswerable', async () => {
    const events: UiEvent[] = []
    const gate = new ApprovalGate((_threadId, event) => events.push(event), rules())

    void gate.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolName: 'write',
      input: { file_path: 'auth.ts' },
      agent: { name: 'odysseus', role: 'developer' },
    })

    expect(events[0]).toMatchObject({ kind: 'approve', agent: { name: 'odysseus' } })
  })

  it('says nothing about an agent when the thread itself is asking', async () => {
    const events: UiEvent[] = []
    const gate = new ApprovalGate((_threadId, event) => events.push(event), rules())

    void gate.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolName: 'write',
      input: { file_path: 'auth.ts' },
    })

    expect(events[0]).not.toHaveProperty('agent')
  })

  it('lets a rule the workspace already granted cover a child with no card', async () => {
    const events: UiEvent[] = []
    const store = rules()
    store.addApproval('w1', ruleKey('write', { file_path: 'auth.ts' }))
    const gate = new ApprovalGate((_threadId, event) => events.push(event), store)

    const verdict = await gate.request({
      threadId: 't1',
      workspaceId: 'w1',
      toolName: 'write',
      input: { file_path: 'auth.ts' },
      agent: { name: 'odysseus', role: 'developer' },
    })

    expect(verdict.blocked).toBe(false)
    expect(events).toEqual([])
  })
})
