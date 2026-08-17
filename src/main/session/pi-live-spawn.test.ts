import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiDriver } from './pi-driver'
import { MODEL, isState, live, waitFor, workspace } from './pi-live-harness'

/** Talks to a real model, so it is opt-in: `PIOCARINA_PI_LIVE=1 pnpm test`.
 *
 *  What this proves that no offline test can: a real agent, given only the
 *  tool's description, hands work to a child; the child runs as a session of
 *  its own with its role's tools; its calls arrive nested under the row that
 *  started it; and the parent reads what the child reported back. */

describe.skipIf(!live)('spawn_agents against a real session', () => {
  it('spawns a child, nests its calls, and reads its report', { timeout: 240_000 }, async () => {
    const { catalog, id: workspaceId } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })

    const { threadId } = await driver.execute('createThread', { workspaceId })
    void driver.execute('prompt', {
      threadId,
      text:
        'Use spawn_agents with the scout role to find out what single word hello.txt contains. ' +
        'Do not read the file yourself — the whole point is that the scout reads it. ' +
        'When the scout reports back, tell me the word it found.',
    })

    const resolved = new Set<string>()
    try {
      await waitFor(async () => {
        for (const event of events) {
          if (event.kind === 'approve' && !resolved.has(event.id)) {
            resolved.add(event.id)
            await driver.execute('resolveApproval', {
              threadId,
              approvalId: event.id,
              outcome: 'allow-once',
            })
          }
        }
        return events.some((event) => isState(event, 'done')) || events.some(failed)
      }, 210_000)
    } finally {
      console.log('[pi-live-spawn]', JSON.stringify(events, null, 1))
    }

    // A child row was opened under the spawn call, carrying its identity.
    const child = events.find((event) => event.kind === 'tool-start' && event.agent !== undefined)
    expect(child).toBeDefined()
    if (child?.kind !== 'tool-start' || !child.agent) throw new Error('unreachable')
    expect(child.agent.role).toBe('scout')
    expect(child.parentId).toBeDefined()

    // The child's own calls nested under the child, not under the spawn.
    const nested = events.filter(
      (event) => event.kind === 'tool-start' && event.parentId === child.id,
    )
    expect(nested.length).toBeGreaterThan(0)

    // It finished, and what it reported reached the parent's reply.
    const settled = events.find(
      (event) => event.kind === 'agent-update' && event.id === child.id,
    )
    expect(settled).toBeDefined()
    if (settled?.kind !== 'agent-update') throw new Error('unreachable')
    expect(settled.agent.status).toBe('ok')
    expect(settled.agent.output ?? '').toContain('ocarina')
  })
})

function failed(event: UiEvent): boolean {
  return event.kind === 'thread-state' && event.state === 'failed'
}
