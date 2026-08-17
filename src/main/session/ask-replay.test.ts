import { describe, expect, it } from 'vitest'
import { answerFromResult, askFromCall, endedUnanswered } from './ask-replay'
import { emitReplay } from './replay'

const QUESTIONS = [
  { id: 'word', kind: 'text', prompt: 'Which word?' },
]

describe('reading a call back out of a transcript', () => {
  it('rebuilds the question', () => {
    expect(askFromCall('call-1', { questions: QUESTIONS })).toEqual({
      kind: 'ask',
      id: 'call-1',
      questions: QUESTIONS,
    })
  })

  it('gives up on arguments it cannot read', () => {
    expect(askFromCall('call-1', {})).toBeNull()
    expect(askFromCall('call-1', { questions: [] })).toBeNull()
    expect(askFromCall('call-1', undefined)).toBeNull()
  })

  it('reads the answers back from the details pi kept', () => {
    const answers = [{ id: 'word', kind: 'text' as const, chosen: [], labels: [], text: 'ocarina' }]

    expect(answerFromResult('call-1', { details: { answers } })).toEqual({
      kind: 'ask-answered',
      id: 'call-1',
      outcome: 'answered',
      answers,
    })
  })

  it('reads them from the text content when that is all there is', () => {
    const text = JSON.stringify({ answers: [] })

    expect(answerFromResult('call-1', { content: [{ type: 'text', text }] })).toMatchObject({
      outcome: 'answered',
    })
  })

  it('keeps what the reader said instead', () => {
    const details = { answers: [], cancelled: true, said: 'neither' }

    expect(answerFromResult('call-1', { details })).toMatchObject({
      outcome: 'cancelled',
      said: 'neither',
    })
  })

  it('reports a turn that ended rather than guessing at an answer', () => {
    expect(answerFromResult('call-1', { details: { cancelled: true, reason: 'turn cancelled' } })).toMatchObject({
      outcome: 'ended',
      reason: 'turn cancelled',
    })
    expect(answerFromResult('call-1', { content: [{ type: 'text', text: 'not json' }] })).toMatchObject({
      outcome: 'ended',
    })
    expect(answerFromResult('call-1', null)).toMatchObject({ outcome: 'ended' })
    expect(endedUnanswered('call-1')).toMatchObject({ outcome: 'ended' })
  })
})

/** A session file's worth of entries, in the shape `emitReplay` reads. */
function entries(...messages: unknown[]): never[] {
  return messages.map((message) => ({ type: 'message', message })) as never[]
}

describe('a thread reopened with a question in it', () => {
  it('comes back as a card, not as a tool row', () => {
    const events: unknown[] = []
    emitReplay(
      (event) => events.push(event),
      entries(
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'call-1', name: 'ask_user', arguments: { questions: QUESTIONS } },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'ask_user',
          details: {
            answers: [{ id: 'word', kind: 'text', chosen: [], labels: [], text: 'ocarina' }],
          },
        },
      ),
    )

    const kinds = events.map((event) => (event as { kind: string }).kind)
    expect(kinds).toContain('ask')
    expect(kinds).toContain('ask-answered')
    expect(kinds).not.toContain('tool-start')
  })

  it('shows a question the app quit under as a turn that ended', () => {
    const events: unknown[] = []
    emitReplay(
      (event) => events.push(event),
      entries({
        role: 'assistant',
        content: [
          { type: 'toolCall', id: 'call-1', name: 'ask_user', arguments: { questions: QUESTIONS } },
        ],
      }),
    )

    const answered = events.find((event) => (event as { kind: string }).kind === 'ask-answered')
    expect(answered).toMatchObject({ outcome: 'ended' })
  })
})
