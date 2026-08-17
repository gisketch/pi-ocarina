import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiDriver } from './pi-driver'
import { MODEL, isState, live, waitFor, workspace } from './pi-live-harness'

/** Talks to a real model, so it is opt-in: `PIOCARINA_PI_LIVE=1 pnpm test`.
 *
 *  What this proves is the one thing no offline test can: that a real agent,
 *  given only the tool's own description, calls `ask_user`, waits for the
 *  answer, and then acts on what it was told. */

describe.skipIf(!live)('ask_user against a real session', () => {
  it('asks, blocks, and uses the answer', { timeout: 180_000 }, async () => {
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
      text:
        'I want a new file in this folder holding one word. ' +
        'Use ask_user to ask me which word it should be — do not guess, and do not write anything until I answer.',
    })

    await waitFor(() => events.some((event) => event.kind === 'ask'), 120_000)
    const ask = events.find((event) => event.kind === 'ask')
    expect(ask).toBeDefined()
    if (ask?.kind !== 'ask') throw new Error('unreachable')

    // The turn is still open: this is the whole point of the tool.
    expect(events.some((event) => isState(event, 'done'))).toBe(false)

    const question = ask.questions[0]
    const answer =
      question.kind === 'text'
        ? { id: question.id, kind: question.kind, chosen: [], labels: [], text: 'ocarina' }
        : {
            id: question.id,
            kind: question.kind,
            chosen: [question.choices?.[0]?.id ?? 'other'],
            labels: [question.choices?.[0]?.title ?? 'ocarina'],
            text: 'ocarina',
          }

    await driver.execute('answerAsk', { threadId, askId: ask.id, answers: [answer] })

    // The agent goes on to write the file, and writing is gated. Answering that
    // too is what lets the turn finish — without it this test times out on the
    // approval card rather than on anything to do with the ask.
    await waitFor(() => events.some((event) => event.kind === 'approve'), 60_000)
    const approval = events.find((event) => event.kind === 'approve')
    if (approval?.kind === 'approve') {
      await driver.execute('resolveApproval', {
        threadId,
        approvalId: approval.id,
        outcome: 'allow-once',
      })
    }

    try {
      await waitFor(() => events.some((event) => isState(event, 'done')), 120_000)
    } finally {
      console.log('[pi-live-ask]', JSON.stringify(events, null, 1))
    }

    // The card records the answer, and the turn carried on afterwards.
    expect(events.some((event) => event.kind === 'ask-answered')).toBe(true)
    const afterAnswer = events.slice(events.findIndex((event) => event.kind === 'ask-answered'))
    expect(afterAnswer.some((event) => event.kind === 'tool-start')).toBe(true)
    // And it used what it was told rather than a word of its own.
    expect(JSON.stringify(afterAnswer)).toContain('ocarina')
  })
})
