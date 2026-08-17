import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiDriver } from './pi-driver'
import { MODEL, isState, live, waitFor, workspace } from './pi-live-harness'

/** Whether a plain request for subagents actually reaches the tool.
 *
 *  Opt-in: `PIOCARINA_PI_LIVE=1 pnpm test`.
 *
 *  This exists because of a real session. A user typed "spawn 2 subagents each
 *  create file_N.txt" and the agent ran two shell commands instead — correctly
 *  following the description's own advice not to fan out for small work. The
 *  advice was right and the outcome was wrong: a request is not advice, and the
 *  word the user typed ("subagents") appeared nowhere in the tool.
 *
 *  The prompt below names no tool. That is the whole point. */

describe.skipIf(!live)('a plain request for subagents', () => {
  it(
    'reaches spawn_agents without the tool being named',
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
        // The user's own words, verbatim. No tool named, and work small enough
        // that the description would otherwise talk the model out of it.
        text: 'spawn 2 subagents each create file_{number}.txt with random content inside',
      })

      const resolved = new Set<string>()
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
        return (
          events.some((event) => isState(event, 'done')) ||
          events.some((event) => event.kind === 'thread-state' && event.state === 'failed')
        )
      }, 210_000)

      const children = events.filter(
        (event) => event.kind === 'tool-start' && event.agent !== undefined,
      )
      expect(children.length).toBeGreaterThanOrEqual(2)
    },
  )
})
