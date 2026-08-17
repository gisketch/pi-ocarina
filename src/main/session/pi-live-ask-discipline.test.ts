import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import { PiDriver } from './pi-driver'
import { MODEL, isState, live, waitFor, workspace } from './pi-live-harness'

/** Talks to a real model, so it is opt-in: `PIOCARINA_PI_LIVE=1 pnpm test`.
 *
 *  The tool's description is the whole product: too eager and the reader stops
 *  reading the cards, too discouraging and the model guesses. These three
 *  prompts are the cheapest standing check on where that line currently sits —
 *  one question it should ask, and two it should not. They are model-dependent
 *  by nature, which is why they live behind the live flag and are read as
 *  evidence rather than as a gate. */

async function run(text: string, answer?: string): Promise<UiEvent[]> {
  const { catalog, id: workspaceId } = await workspace()
  const events: UiEvent[] = []
  const driver = new PiDriver({
    emit: (_threadId, event) => events.push(event),
    catalog,
    model: MODEL,
  })

  const { threadId } = await driver.execute('createThread', { workspaceId })
  void driver.execute('prompt', { threadId, text })

  await waitFor(
    () =>
      events.some((event) => event.kind === 'ask') ||
      events.some((event) => event.kind === 'approve') ||
      events.some((event) => isState(event, 'done')),
    120_000,
  )

  // Let it finish rather than leaving a turn parked: an unanswered question
  // holds the session open, which is the whole point of the tool.
  const ask = events.find((event) => event.kind === 'ask')
  if (ask?.kind === 'ask' && answer !== undefined) {
    const question = ask.questions[0]
    await driver.execute('answerAsk', {
      threadId,
      askId: ask.id,
      answers: [
        {
          id: question.id,
          kind: question.kind,
          chosen: question.choices?.[0] ? [question.choices[0].id] : [],
          labels: question.choices?.[0] ? [question.choices[0].title] : [],
          text: answer,
        },
      ],
    })
  }
  await driver.dispose()
  // Always printed: what the model reached for is the evidence this test is
  // about, and a bare true/false says nothing about why.
  console.log('[ask-discipline]', text.slice(0, 40), events.map((event) => event.kind).join(','))
  return events
}

const asked = (events: UiEvent[]): boolean => events.some((event) => event.kind === 'ask')

describe.skipIf(!live)('when the model reaches for the tool', () => {
  // Retried, and the retry is the finding: on the same prompt this model asks
  // most of the time and occasionally answers in prose instead. A single run is
  // evidence about one sample, not about the description — so this is allowed
  // three samples before it calls the discipline broken.
  it('asks when only the reader can decide', { timeout: 180_000, retry: 2 }, async () => {
    const events = await run(
      'Add a cache to this project. I have not decided whether it should be in memory or on disk, ' +
        'and the two are very different to live with.',
      'in memory',
    )

    expect(asked(events)).toBe(true)
  })

  it('does not ask what the folder already answers', { timeout: 180_000 }, async () => {
    const events = await run('What is in hello.txt? Reply with its contents and nothing else.')

    expect(asked(events)).toBe(false)
  })

  it('does not ask permission for work it was already told to do', { timeout: 180_000 }, async () => {
    const events = await run('Create notes.txt containing the single word ocarina.')

    expect(asked(events)).toBe(false)
  })
})
