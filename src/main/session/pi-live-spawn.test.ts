import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiDriver } from './pi-driver'
import { MODEL, isState, live, textOf, waitFor, workspace } from './pi-live-harness'

/** Talks to a real model, so it is opt-in: `PIOCARINA_PI_LIVE=1 pnpm test`.
 *
 *  What these prove that no offline test can: a real agent, given only the
 *  tool's description, hands work to children; each child runs as a session of
 *  its own with its role's tools; their calls arrive nested under the rows that
 *  started them; and the parent reads what they reported back. */

describe.skipIf(!live)('spawn_agents against a real session', () => {
  // `retry` because a machine may also have pi's own `subagent` package
  // installed, and a model shown two tools that do the same job picks between
  // them. The retry is itself the finding — see the spec's risks.
  it(
    'spawns a child, nests its calls, and reads its report',
    { timeout: 240_000, retry: 2 },
    async () => {
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
          'Call the tool named exactly `spawn_agents` — not any other subagent tool — ' +
          'with the scout role, to find out what single word hello.txt contains. ' +
          'Do not read the file yourself. When the scout reports back, tell me the word it found.',
      })

      await settle(driver, threadId, events)

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

      // The last update, not the first: a child reports twice, once when it
      // leaves the queue and once when it settles.
      const settled = events.findLast(
        (event) => event.kind === 'agent-update' && event.id === child.id && event.agent.endedAt,
      )
      expect(settled).toBeDefined()
      if (settled?.kind !== 'agent-update') throw new Error('unreachable')
      expect(settled.agent.status).toBe('ok')
      expect(settled.agent.output ?? '').toContain('ocarina')

      // And the parent read it: the whole point of the envelope is that what
      // the child found reaches the reply.
      expect(textOf(events)).toContain('ocarina')
    },
  )
})

describe.skipIf(!live)('several children at once', () => {
  // Same retry, same reason: a machine with pi's own `subagent` package
  // installed shows the model two tools that do the same job.
  it(
    'runs three, names them apart, and reports all three',
    { timeout: 240_000, retry: 2 },
    async () => {
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
          'In one `spawn_agents` call, start three scouts at the same time. ' +
          'Give each one a different question about this folder: what hello.txt contains, ' +
          'how many files are here, and what the folder is called. ' +
          'Do not look yourself. Report all three answers when they come back.',
      })

      await settle(driver, threadId, events)

      const children = events.filter(
        (event) => event.kind === 'tool-start' && event.agent !== undefined,
      )
      expect(children.length).toBeGreaterThanOrEqual(3)

      // No two children alive at the same moment share a name.
      const names = children.map((event) => (event.kind === 'tool-start' ? event.agent!.name : ''))
      expect(new Set(names).size).toBe(names.length)

      const done = events.filter((event) => event.kind === 'agent-update' && event.agent.endedAt)
      expect(done.length).toBeGreaterThanOrEqual(3)

      // The parent consolidated them rather than reporting one and stopping.
      expect(textOf(events)).toContain('ocarina')
    },
  )
})

/** Waits for the turn to end, answering every approval it meets on the way.
 *
 *  A child holding real tools raises real cards, and a test that waited without
 *  answering them would time out behind its own gate. */
async function settle(driver: PiDriver, threadId: string, events: UiEvent[]): Promise<void> {
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
    console.log('[pi-live-spawn]', JSON.stringify(events.filter(interesting), null, 1))
  }
}

/** The spawn shape, without every token of every message. */
function interesting(event: UiEvent): boolean {
  return event.kind === 'tool-start' || event.kind === 'agent-update' || event.kind === 'tool-end'
}

function failed(event: UiEvent): boolean {
  return event.kind === 'thread-state' && event.state === 'failed'
}
