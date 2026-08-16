import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiDriver } from './pi-driver'
import { MODEL, isState, live, textOf, waitFor, workspace } from './pi-live-harness'

describe.skipIf(!live)('a window reload', () => {
  it('replays history when the window reloads', { timeout: 180_000 }, async () => {
    // A window reload resets the renderer and leaves main untouched, so every
    // thread is still open on this side while the renderer has lost all of it.
    // Answering that with only a model name left the user staring at empty
    // columns until they restarted the whole app.
    const { catalog, id: workspaceId } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })

    const { threadId } = await driver.execute('createThread', { workspaceId })
    await driver.execute('prompt', { threadId, text: 'Say the word ocarina and nothing else.' })
    await waitFor(() => events.some((event) => isState(event, 'done')), 120_000)

    // The same driver, the same open session — only the listener is new.
    events.length = 0
    await driver.execute('openThread', { threadId })

    expect(events[0]).toEqual({ kind: 'thread-reset' })
    expect(textOf(events).toLowerCase()).toContain('ocarina')
    // Still says which model, which is what the already-open path was for.
    expect(events.some((event) => event.kind === 'model')).toBe(true)

    await driver.dispose()
  })
})
