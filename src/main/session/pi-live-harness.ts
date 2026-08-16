/** Shared ground for the live-pi tests.
 *
 *  These talk to a real model, so they are opt-in: `PIOCARINA_PI_LIVE=1 pnpm
 *  test`. The helpers live here because three test files need them, and a
 *  second copy of the model pin or the workspace fixture is a copy that goes
 *  stale without anybody noticing. */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UiEvent } from '../../shared/protocol'
import { CatalogStore } from '../catalog-store'

export const live = process.env.PIOCARINA_PI_LIVE === '1'

/** Pinned so runs are cheap and repeatable rather than whatever pi's config
 *  happens to default to on this machine. */
export const MODEL = { provider: 'openai-codex', id: 'gpt-5.4-mini' }

export async function workspace(): Promise<{ catalog: CatalogStore; id: string; cwd: string }> {
  const cwd = await mkdtemp(join(tmpdir(), 'piocarina-live-'))
  await writeFile(join(cwd, 'hello.txt'), 'ocarina\n', 'utf8')

  const catalog = new CatalogStore(join(cwd, 'catalog.json'))
  await catalog.load()
  return { catalog, id: catalog.pin(cwd).id, cwd }
}

/** Everything the agent said, joined. */
export function textOf(events: UiEvent[]): string {
  return events
    .filter((event) => event.kind === 'agent-message-delta')
    .map((event) => (event.kind === 'agent-message-delta' ? event.text : ''))
    .join('')
}

export function isState(event: UiEvent, state: string): boolean {
  return event.kind === 'thread-state' && event.state === state
}

/** Polls until the condition holds. The condition may be async: some of these
 *  wait on the filesystem rather than on an event already in hand. */
export async function waitFor(
  done: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the turn to finish')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
