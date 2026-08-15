import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayThread } from '../../renderer/src/lib/thread-reducer'
import type { UiEvent } from '../../shared/protocol'
import { CatalogStore } from '../catalog-store'
import { PiDriver } from './pi-driver'

/** Talks to a real model, so it is opt-in: `PIOCARINA_PI_LIVE=1 pnpm test`.
 *
 *  This is the proving ground for the spec's assumptions about pi. Everything
 *  that can be checked without a model lives in pi-translate.test.ts and
 *  replay.test.ts, which run offline. */
const live = process.env.PIOCARINA_PI_LIVE === '1'

// Pinned so runs are cheap and repeatable rather than whatever pi's config
// happens to default to on this machine.
const MODEL = { provider: 'openai-codex', id: 'gpt-5.4-mini' }

async function workspace(): Promise<{ catalog: CatalogStore; id: string; cwd: string }> {
  const cwd = await mkdtemp(join(tmpdir(), 'piocarina-live-'))
  await writeFile(join(cwd, 'hello.txt'), 'ocarina\n', 'utf8')

  const catalog = new CatalogStore(join(cwd, 'catalog.json'))
  await catalog.load()
  return { catalog, id: catalog.pin(cwd).id, cwd }
}

describe.skipIf(!live)('pi driver against a real session', () => {
  it('streams a prompt end to end, then replays it on reopen', { timeout: 180_000 }, async () => {
    const { catalog, id: workspaceId } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })

    const { threadId } = await driver.execute('createThread', { workspaceId })
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
    expect(textOf(events).toLowerCase()).toContain('ocarina')

    const read = events.find((event) => event.kind === 'tool-start' && event.tool === 'read')
    expect(read).toBeDefined()

    // Workspace isolation: pi ignores its own cwd option when building tools, so
    // this asserts the driver's rebinding still holds. Without it the agent
    // reads whatever sits in the Electron process's directory.
    expect(events.filter((event) => event.kind === 'tool-end' && event.status === 'fail')).toEqual([])

    // The usage risk: pi reports its own figures and we pass them through.
    const usage = events.find((event) => event.kind === 'usage')
    expect(usage?.kind === 'usage' && usage.tokens).toBeGreaterThan(0)

    expect(existsSync(driver.sessionFile(threadId) ?? '')).toBe(true)
    await driver.dispose()

    // --- Relaunch: a fresh driver, the same catalog, nothing in memory. ---

    const replayed: UiEvent[] = []
    const reopened = new PiDriver({
      emit: (_threadId, event) => replayed.push(event),
      catalog,
      model: MODEL,
    })

    const { threads } = await reopened.execute('listThreads', { workspaceId })
    expect(threads.map((thread) => thread.id)).toContain(threadId)
    expect(threads[0].title.length).toBeGreaterThan(0)

    await reopened.execute('openThread', { threadId })

    // The same conversation, rebuilt from disk rather than watched.
    expect(textOf(replayed).toLowerCase()).toContain('ocarina')
    expect(replayed.filter((event) => event.kind === 'tool-start')).toHaveLength(
      events.filter((event) => event.kind === 'tool-start').length,
    )
    // The replayed transcript ends settled. Checked on the last *state* rather
    // than the last event, because attaching the session also reports which
    // model it is on, and that metadata legitimately arrives after the history.
    const states = replayed.filter((event) => event.kind === 'thread-state')
    expect(states.at(-1)).toMatchObject({ kind: 'thread-state', state: 'done' })
    expect(replayed.some((event) => event.kind === 'model')).toBe(true)

    await reopened.dispose()
  })
})

describe.skipIf(!live)('approvals against a real session', () => {
  it('blocks a denied command, then remembers "always"', { timeout: 180_000 }, async () => {
    const { catalog, id: workspaceId } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })
    const { threadId } = await driver.execute('createThread', { workspaceId })

    const run = async (outcome: 'deny' | 'always'): Promise<void> => {
      const before = events.length
      await driver.execute('prompt', {
        threadId,
        text: 'Run exactly this shell command and nothing else: echo ocarina',
      })

      await waitFor(() => events.slice(before).some((event) => event.kind === 'approve'), 60_000)
      const approval = events.slice(before).find((event) => event.kind === 'approve')
      if (approval?.kind !== 'approve') throw new Error('no approval was requested')

      await driver.execute('resolveApproval', { threadId, approvalId: approval.id, outcome })
      await waitFor(
        () => events.slice(before).some((event) => isState(event, 'done') || isState(event, 'idle')),
        90_000,
      )
    }

    // The gate exists at all: pi asked before touching the shell. The blocked
    // call reads as `denied`, not `fail` — pi reports one boolean for every bad
    // outcome, so only the gate's own record can tell the two apart.
    await run('deny')
    console.log('[pi-live approvals]', JSON.stringify(events.map((event) => event.kind)))
    expect(events.some((event) => event.kind === 'tool-end' && event.status === 'denied')).toBe(
      true,
    )
    expect(events.some((event) => event.kind === 'tool-end' && event.status === 'fail')).toBe(false)
    expect(catalog.listApprovals(workspaceId)).toEqual([])

    // "always" is remembered against the program, not against bash as a whole.
    await run('always')
    expect(catalog.listApprovals(workspaceId)).toEqual(['bash:echo'])

    // And the rule holds: the next echo runs without asking again.
    const before = events.length
    await driver.execute('prompt', {
      threadId,
      text: 'Run exactly this shell command and nothing else: echo again',
    })
    await waitFor(() => events.slice(before).some((event) => isState(event, 'done')), 90_000)
    expect(events.slice(before).some((event) => event.kind === 'approve')).toBe(false)

    // The card the user actually sees: the same events, projected. Asserting on
    // the rendered block is what proves the round trip closed, rather than that
    // an event merely went past.
    const projected = replayThread(events)
    const cards = projected.blocks.filter((block) => block.kind === 'approve')
    expect(cards.map((card) => card.kind === 'approve' && card.outcome)).toEqual([
      'deny',
      'always',
    ])

    // And the ledger row the user reads blames the right party.
    const rows = projected.blocks.flatMap((block) => (block.kind === 'ledger' ? block.rows : []))
    expect(rows.some((row) => row.status === 'denied')).toBe(true)
    expect(cards.every((card) => card.kind === 'approve' && card.command.startsWith('echo'))).toBe(
      true,
    )

    await driver.dispose()
  })
})

describe.skipIf(!live)('checkpoint restore against a real session', () => {
  it('rewinds the conversation and leaves the files alone', { timeout: 180_000 }, async () => {
    const { catalog, id: workspaceId, cwd } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })
    const { threadId } = await driver.execute('createThread', { workspaceId })

    await driver.execute('prompt', { threadId, text: 'Reply with the single word: first' })
    await waitFor(() => events.some((event) => isState(event, 'done')), 90_000)

    const before = events.length
    await driver.execute('prompt', { threadId, text: 'Reply with the single word: second' })
    await waitFor(() => events.slice(before).some((event) => isState(event, 'done')), 90_000)
    expect(textOf(events).toLowerCase()).toContain('second')

    // A file written after the checkpoint. Restoring must not remove it — that
    // is the promise the confirm dialog makes to the user.
    const witness = join(cwd, 'written-after.txt')
    await writeFile(witness, 'still here\n', 'utf8')

    // Reopen the thread's history to learn the checkpoint ids on disk.
    const history: UiEvent[] = []
    const reader = new PiDriver({
      emit: (_threadId, event) => history.push(event),
      catalog,
      model: MODEL,
    })
    await reader.execute('listThreads', { workspaceId })
    await driver.execute('archiveThread', { threadId })
    await reader.execute('openThread', { threadId })

    const checkpoints = history.filter((event) => event.kind === 'checkpoint')
    expect(checkpoints.length).toBeGreaterThanOrEqual(2)

    // Restoring to the second checkpoint undoes the second turn and keeps the
    // first. (pi rewinds to *before* the chosen user message, so restoring to
    // the first checkpoint would empty the thread entirely.)
    const second = checkpoints[1]
    if (second.kind !== 'checkpoint') throw new Error('no checkpoint')

    const after = history.length
    await reader.execute('restoreCheckpoint', { threadId, checkpointId: second.id })
    const restored = history.slice(after)

    console.log('[pi-live restore]', JSON.stringify(restored.map((event) => event.kind)))

    // The thread is rebuilt, not appended to: the first turn survives and the
    // second is gone.
    expect(restored[0]).toEqual({ kind: 'thread-reset' })
    expect(textOf(restored).toLowerCase()).toContain('first')
    expect(textOf(restored).toLowerCase()).not.toContain('second')

    // The working tree is untouched — which is exactly what the restore
    // confirmation promises the user, so it is worth asserting here.
    expect(existsSync(witness)).toBe(true)

    // Projected: a rewound thread renders as one conversation, not two glued
    // together. The reset must have cleared the pre-restore blocks.
    const rebuilt = replayThread(history)
    const users = rebuilt.blocks.filter((block) => block.kind === 'user')
    expect(users).toHaveLength(1)
    expect(rebuilt.blocks.some((block) => block.kind === 'checkpoint')).toBe(true)

    await reader.dispose()
    await driver.dispose()
  })
})

describe.skipIf(!live)('steering and compaction against a real session', () => {
  it('queues a steer mid-turn and compacts the thread', { timeout: 180_000 }, async () => {
    const { catalog, id: workspaceId } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })
    const { threadId } = await driver.execute('createThread', { workspaceId })

    // Long enough that there is a turn in flight to steer into.
    await driver.execute('prompt', {
      threadId,
      text: 'Count from 1 to 40, one number per line, with no other words.',
    })
    await waitFor(() => events.some((event) => isState(event, 'running')), 60_000)

    const { steerId } = await driver.execute('steer', { threadId, text: 'Also say: steered.' })
    expect(steerId).not.toBe('')
    expect(events.some((event) => event.kind === 'steer-queued')).toBe(true)

    await waitFor(() => events.some((event) => isState(event, 'done')), 120_000)

    // Delivery is the risky half: pi reports the queue, not its transitions.
    console.log('[pi-live steer]', JSON.stringify(events.map((event) => event.kind)))
    expect(events.some((event) => event.kind === 'steer-delivered')).toBe(true)

    // Projected: a delivered steer leaves no QUEUED row behind. One that
    // lingered would tell the user their message is still waiting to be sent.
    expect(replayThread(events).blocks.some((block) => block.kind === 'steer')).toBe(false)

    const before = events.length
    await driver.execute('compact', { threadId })

    console.log('[pi-live compact]', JSON.stringify(events.slice(before), null, 1))
    const compaction = events.slice(before)
    expect(compaction[0]).toMatchObject({ kind: 'compaction-start' })

    // pi decides whether there is anything worth compacting. Either answer is
    // valid; what must never happen is the thread being marked failed for it.
    const settled = compaction.some(
      (event) => event.kind === 'compaction-done' || event.kind === 'compaction-skipped',
    )
    expect(settled).toBe(true)

    // Projected: whichever answer came back, the divider stopped running. A
    // compaction left mid-shimmer would claim the app is still working.
    const compactions = replayThread(events).blocks.filter((block) => block.kind === 'compaction')
    expect(compactions).toHaveLength(1)
    expect(compactions[0]).toMatchObject({ running: false })
    expect(compaction.some((event) => isState(event, 'failed'))).toBe(false)

    await driver.dispose()
  })
})

function textOf(events: UiEvent[]): string {
  return events
    .filter((event) => event.kind === 'agent-message-delta')
    .map((event) => (event.kind === 'agent-message-delta' ? event.text : ''))
    .join('')
}

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
