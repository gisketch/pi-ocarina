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

describe.skipIf(!live)('models against a real session', () => {
  it('lists pi’s own models and moves a thread onto one', { timeout: 180_000 }, async () => {
    const { catalog, id: workspaceId } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })
    const { threadId } = await driver.execute('createThread', { workspaceId })

    const { models } = await driver.execute('listModels', {})
    console.log('[pi-live models]', models.length, models.slice(0, 3).map((m) => `${m.provider}/${m.id}`))

    // pi's own config is the catalogue; the app never ships a model list.
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((model) => model.id && model.provider && model.name)).toBe(true)
    expect(models.every((model) => model.contextWindow > 0)).toBe(true)

    // Opening a thread reports what it is running on, so the chip never guesses.
    const opened = events.filter((event) => event.kind === 'model')
    expect(opened.length).toBeGreaterThan(0)
    expect(opened[0]).toMatchObject({ provider: MODEL.provider, id: MODEL.id })

    // Switching is pi's to persist: it writes the choice into the session.
    const target = models.find((model) => model.id !== MODEL.id) ?? models[0]
    const before = events.length
    await driver.execute('setModel', {
      threadId,
      provider: target.provider,
      model: target.id,
    })

    const changed = events.slice(before).filter((event) => event.kind === 'model')
    expect(changed.at(-1)).toMatchObject({ provider: target.provider, id: target.id })

    await driver.dispose()
  })

  it('says the model again when a created thread is opened', { timeout: 60_000 }, async () => {
    // The renderer subscribes only once `createThread` has returned, so the
    // announce made while the session was adopted reached nobody. Without this
    // the titlebar chip reads "pi default" for the life of the thread.
    const { catalog, id: workspaceId } = await workspace()

    const events: UiEvent[] = []
    const driver = new PiDriver({
      emit: (_threadId, event) => events.push(event),
      catalog,
      model: MODEL,
    })

    const { threadId } = await driver.execute('createThread', { workspaceId })
    events.length = 0

    await driver.execute('openThread', { threadId })

    expect(events.filter((event) => event.kind === 'model').at(-1)).toMatchObject({
      provider: MODEL.provider,
      id: MODEL.id,
    })
    // The meter has something to read before the thread's first turn ends.
    expect(events.some((event) => event.kind === 'usage')).toBe(true)

    await driver.dispose()
  })
})
