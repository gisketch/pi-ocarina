/** What a new thread opens on.
 *
 *  Split from the driver because it is a question about the reader's settings
 *  rather than about running a turn, and because a model named in settings can
 *  be gone from pi's configuration — the failure belongs next to the decision,
 *  not in the middle of a command switch. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { EmitEvent } from '../../shared/protocol'
import type { CatalogStore } from '../catalog-store'
import type { ModelControl } from './model-control'

export interface DefaultsDeps {
  catalog: CatalogStore
  models: ModelControl
  emit: EmitEvent
}

export async function applyThreadDefaults(
  deps: DefaultsDeps,
  threadId: string,
  session: AgentSession | undefined,
): Promise<void> {
  if (!session) return

  const { defaultModel, defaultReasoning } = deps.catalog.snapshot().preferences

  if (defaultModel) {
    try {
      await deps.models.set(session, defaultModel.provider, defaultModel.id)
    } catch {
      // Named in settings, gone from pi's config. Nothing to do about it here.
    }
  }
  if (defaultReasoning) deps.models.setReasoning(session, defaultReasoning)
  if (defaultModel || defaultReasoning) deps.models.announce(threadId, session, deps.emit)
}
