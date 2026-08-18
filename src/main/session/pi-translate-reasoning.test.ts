import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import { PiTranslator } from './pi-translate'

/** pi's event shapes, fabricated — see the note in `pi-translate.test.ts`. */
const pi = (event: unknown): AgentSessionEvent => event as AgentSessionEvent

const start = (translator: PiTranslator): void => {
  translator.translate(pi({ type: 'message_start', message: { role: 'assistant' } }))
}

const update = (translator: PiTranslator, delta: unknown) =>
  translator.translate(pi({ type: 'message_update', assistantMessageEvent: delta }))

describe('what the model thought before it answered', () => {
  it('opens, streams and closes as its own block', () => {
    const translator = new PiTranslator(() => undefined, () => false)
    start(translator)

    expect(update(translator, { type: 'thinking_start' })[0]).toMatchObject({
      kind: 'reasoning-start',
    })
    expect(update(translator, { type: 'thinking_delta', delta: 'the lock ' })[0]).toMatchObject({
      kind: 'reasoning-delta',
      text: 'the lock ',
    })
    expect(update(translator, { type: 'thinking_end' })[0]).toMatchObject({ kind: 'reasoning-end' })
  })

  it('keeps the thought apart from the answer', () => {
    const translator = new PiTranslator(() => undefined, () => false)
    start(translator)
    update(translator, { type: 'thinking_start' })
    update(translator, { type: 'thinking_delta', delta: 'thinking' })
    update(translator, { type: 'thinking_end' })

    const said = update(translator, { type: 'text_delta', delta: 'answering' })
    expect(said[0]).toMatchObject({ kind: 'agent-message-delta', text: 'answering' })
    // Two ids, so the two never land in the same block.
    expect((said[0] as { id: string }).id).not.toBe('msg-1-think')
  })

  it('says how long it took', () => {
    const translator = new PiTranslator(() => undefined, () => false)
    start(translator)
    update(translator, { type: 'thinking_start' })

    const [ended] = update(translator, { type: 'thinking_end' })
    expect(ended).toMatchObject({ kind: 'reasoning-end' })
    expect((ended as { ms: number }).ms).toBeGreaterThanOrEqual(0)
  })

  it('closes a thought the turn cut short', () => {
    // A turn aborted mid-thought never sends `thinking_end`; without this the
    // block would stream forever.
    const translator = new PiTranslator(() => undefined, () => false)
    start(translator)
    update(translator, { type: 'thinking_start' })

    const ended = translator.translate(
      pi({ type: 'message_end', message: { role: 'assistant', stopReason: 'aborted' } }),
    )
    expect(ended[0]).toMatchObject({ kind: 'reasoning-end' })
  })

  it('says nothing at all for a model that does not think', () => {
    const translator = new PiTranslator(() => undefined, () => false)
    start(translator)

    const said = update(translator, { type: 'text_delta', delta: 'straight to it' })
    expect(said.every((one) => !one.kind.startsWith('reasoning'))).toBe(true)
  })
})
