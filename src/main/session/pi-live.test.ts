import { mkdtemp, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiDriver } from './pi-driver'

/** Talks to a real model, so it is opt-in: `PIOCARINA_PI_LIVE=1 pnpm test`.
 *
 *  This is the ticket's proving ground — the assertions below are what turn the
 *  spec's "pi emits usage / this granularity" assumptions into verified facts.
 *  Everything else about the adapter is covered by pi-translate.test.ts, which
 *  runs offline. */
const live = process.env.PIOCARINA_PI_LIVE === '1'

describe.skipIf(!live)('pi driver against a real session', () => {
  it(
    'streams a prompt end to end and writes a session file',
    { timeout: 180_000 },
    async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'piocarina-live-'))
      await writeFile(join(cwd, 'hello.txt'), 'ocarina\n', 'utf8')

      const events: UiEvent[] = []
      const driver = new PiDriver({
        emit: (_threadId, event) => events.push(event),
        resolveWorkspace: () => cwd,
        // Pinned so the run is cheap and repeatable rather than whatever pi's
        // config happens to default to on this machine.
        model: { provider: 'openai-codex', id: 'gpt-5.4-mini' },
      })

      const { threadId } = await driver.execute('createThread', { workspaceId: 'live' })
      await driver.execute('prompt', {
        threadId,
        text: 'Read hello.txt and reply with only its contents.',
      })

      try {
        await waitFor(() => events.some((event) => isState(event, 'done')), 120_000)
      } finally {
        // Always printed: on failure this is the only record of what pi said.
        console.log('[pi-live]', JSON.stringify(events, null, 1))
      }

      const kinds = events.map((event) => event.kind)
      expect(kinds).toContain('agent-message-delta')
      expect(kinds).toContain('tool-start')
      expect(kinds).toContain('tool-end')

      const text = events
        .filter((event) => event.kind === 'agent-message-delta')
        .map((event) => (event.kind === 'agent-message-delta' ? event.text : ''))
        .join('')
      expect(text.toLowerCase()).toContain('ocarina')

      const read = events.find((event) => event.kind === 'tool-start' && event.tool === 'read')
      expect(read).toBeDefined()

      // Workspace isolation: pi ignores its own cwd option when building tools,
      // so this asserts the driver's rebinding still holds. Without it the agent
      // reads whatever sits in the Electron process's directory.
      const failed = events.filter((event) => event.kind === 'tool-end' && event.status === 'fail')
      expect(failed).toHaveLength(0)

      // The usage risk: pi reports its own figures and we pass them through.
      const usage = events.find((event) => event.kind === 'usage')
      expect(usage).toBeDefined()
      expect(usage?.kind === 'usage' && usage.tokens).toBeGreaterThan(0)

      expect(driver.sessionFile(threadId)).toBeDefined()
      expect(existsSync(driver.sessionFile(threadId) ?? '')).toBe(true)

      await driver.dispose()
    },
  )
})

function isState(event: UiEvent, state: string): boolean {
  return event.kind === 'thread-state' && event.state === state
}

async function waitFor(done: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!done()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the turn to finish')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
