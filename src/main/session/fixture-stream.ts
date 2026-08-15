import type { UiEvent } from '../../shared/protocol'

export interface ScriptStep {
  /** Delay from the previous step, so a script reads as a timeline. */
  afterMs: number
  event: UiEvent
}

/** A scripted turn used by the stub driver.
 *
 *  It exists to exercise the seam before pi is wired: streaming deltas, a tool
 *  that opens and settles, an event kind this build does not know (which must
 *  survive as a `raw` row), and usage figures. The thread reducer gets its own
 *  fixtures later — this one is about transport, not projection. */
export function promptScript(text: string): ScriptStep[] {
  const messageId = 'm-1'
  const toolId = 'tool-1'

  return [
    { afterMs: 0, event: { kind: 'user-message', id: 'u-1', text } },
    { afterMs: 0, event: { kind: 'thread-state', state: 'running' } },
    { afterMs: 40, event: { kind: 'agent-message-start', id: messageId } },

    ...deltas(messageId, ['Reading ', 'the ', 'fixture ', 'stream', '.']),

    {
      afterMs: 60,
      event: { kind: 'tool-start', id: toolId, tool: 'read', target: 'src/shared/protocol.ts' },
    },
    {
      afterMs: 120,
      event: {
        kind: 'tool-body',
        id: toolId,
        body: {
          type: 'code',
          lines: [
            { text: 'export const PROTOCOL_VERSION = 1' },
            { text: 'export type UiEvent =', comment: 'the whole vocabulary' },
          ],
        },
      },
    },
    { afterMs: 40, event: { kind: 'tool-end', id: toolId, status: 'ok', meta: '2L' } },

    // Deliberately not in the vocabulary: proves unknown kinds stay visible.
    {
      afterMs: 40,
      event: { kind: 'sonata-experiment', note: 'from a newer backend' } as unknown as UiEvent,
    },

    { afterMs: 40, event: { kind: 'agent-message-end', id: messageId } },
    { afterMs: 0, event: { kind: 'usage', contextPercent: 38, tokens: 12_400, costUsd: 0.31 } },
    { afterMs: 0, event: { kind: 'thread-state', state: 'done' } },
  ]
}

function deltas(id: string, chunks: string[]): ScriptStep[] {
  return chunks.map((text) => ({ afterMs: 30, event: { kind: 'agent-message-delta', id, text } }))
}
