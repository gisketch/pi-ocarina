import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiTranslator, resultText, toolKind, toolTarget } from './pi-translate'

/** pi's event shapes, fabricated. Casting keeps the fixtures readable without
 *  building whole `AgentMessage` objects the translator never looks at. */
const pi = (event: unknown): AgentSessionEvent => event as AgentSessionEvent

function run(events: unknown[]): UiEvent[] {
  const translator = new PiTranslator()
  return events.flatMap((event) => translator.translate(pi(event)))
}

describe('PiTranslator — turn lifecycle', () => {
  it('reports pi retrying a flaky provider as a degraded connection', () => {
    const [event] = run([
      { type: 'auto_retry_start', attempt: 1, maxAttempts: 3, delayMs: 4000, errorMessage: '503' },
    ])

    expect(event).toMatchObject({ kind: 'connectivity', state: 'degraded', retryInSeconds: 4 })
  })

  it('never shows a countdown of zero seconds', () => {
    const [event] = run([
      { type: 'auto_retry_start', attempt: 1, maxAttempts: 3, delayMs: 200, errorMessage: 'x' },
    ])

    expect(event).toMatchObject({ retryInSeconds: 1 })
  })

  it('clears the banner when a retry succeeds', () => {
    const events = run([{ type: 'auto_retry_end', success: true, attempt: 2 }])

    expect(events).toEqual([{ kind: 'connectivity', state: 'restored' }])
  })

  it('turns exhausted retries into a failure the user can act on', () => {
    const events = run([
      { type: 'auto_retry_end', success: false, attempt: 3, finalError: 'provider unreachable' },
    ])

    expect(events[0]).toMatchObject({ kind: 'connectivity', state: 'restored' })
    expect(events[1]).toMatchObject({ kind: 'thread-state', state: 'failed' })
    expect(events[1]).toMatchObject({ reason: 'provider unreachable' })
  })

  it('does not then claim the turn finished successfully', () => {
    const events = run([
      { type: 'auto_retry_end', success: false, attempt: 3, finalError: 'nope' },
      { type: 'agent_end', willRetry: false },
    ])

    expect(events.filter((event) => event.kind === 'thread-state')).toHaveLength(1)
  })

  it('reports a finished compaction with before and after percentages', () => {
    const translator = new PiTranslator(() => 200_000)
    const events = [
      { type: 'compaction_start', reason: 'threshold' },
      {
        type: 'compaction_end',
        reason: 'threshold',
        aborted: false,
        willRetry: false,
        result: { summary: 'we did things', tokensBefore: 100_000, estimatedTokensAfter: 20_000 },
      },
    ].flatMap((event) => translator.translate(pi(event)))

    expect(events[0]).toMatchObject({ kind: 'compaction-start' })
    expect(events[1]).toMatchObject({
      kind: 'compaction-done',
      beforePercent: 50,
      afterPercent: 10,
      summary: 'we did things',
      // The raw gain, which is what the divider leads with — percentages
      // need the window, the saving does not.
      tokensSaved: 80_000,
    })
  })

  it('pairs a compaction with the run that started it', () => {
    const translator = new PiTranslator(() => 100)
    const first = translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))
    translator.translate(
      pi({
        type: 'compaction_end',
        reason: 'manual',
        aborted: false,
        willRetry: false,
        result: { summary: 's', tokensBefore: 50, estimatedTokensAfter: 10 },
      }),
    )
    const second = translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))

    expect(first[0].kind === 'compaction-start' && first[0].id).not.toBe(
      second[0].kind === 'compaction-start' && second[0].id,
    )
  })

  it('treats a refused compaction as a note, not a broken thread', () => {
    const translator = new PiTranslator(() => 200_000)
    translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))
    const events = translator.translate(
      pi({
        type: 'compaction_end',
        reason: 'manual',
        aborted: false,
        willRetry: false,
        result: undefined,
        errorMessage: 'Nothing to compact (session too small)',
      }),
    )

    // Named, and carrying the id of the start it ends — otherwise nothing can
    // stop the running divider the start put on screen.
    expect(events[0]).toMatchObject({
      kind: 'compaction-skipped',
      id: 'compaction-1',
      reason: 'Nothing to compact (session too small)',
    })
    expect(events.some((event) => event.kind === 'thread-state')).toBe(false)
  })

  it('reports zero percentages rather than guessing without a context window', () => {
    const translator = new PiTranslator()
    translator.translate(pi({ type: 'compaction_start', reason: 'manual' }))
    const [done] = translator.translate(
      pi({
        type: 'compaction_end',
        reason: 'manual',
        aborted: false,
        willRetry: false,
        result: { summary: 's', tokensBefore: 100, estimatedTokensAfter: 10 },
      }),
    )

    expect(done).toMatchObject({ beforePercent: 0, afterPercent: 0 })
  })

  it('surfaces an event kind it has never seen instead of dropping it', () => {
    const events = run([{ type: 'summarization_retry_scheduled', attempt: 2 }])

    expect(events[0]).toMatchObject({ kind: 'raw', rawKind: 'summarization_retry_scheduled' })
  })
})
