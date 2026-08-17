/** An `ask_user` call, read back out of a session file.
 *
 *  The card is not in pi's transcript — pi records a tool call and its result,
 *  and the questions and answers are inside those. So a reopened thread rebuilds
 *  the card from them rather than showing the generic tool row, which would say
 *  "ask_user ✓" about a conversation the reader was part of.
 *
 *  Nothing here is live: a question read out of history has already ended, one
 *  way or another, and cannot be answered. The call it belonged to is gone. */

import type { UiEvent } from '../../shared/protocol'
import type { AskAnswer, AskOutcome, AskQuestion } from '../../shared/vocabulary'

export const ASK_TOOL = 'ask_user'

/** What a card says when the transcript does not say why it ended. */
export const ENDED_UNSAID = 'the turn ended'

/** Whether a call's arguments hold questions a card could be made from. */
export function askable(args: unknown): boolean {
  const questions = (args as { questions?: unknown })?.questions
  return Array.isArray(questions) && questions.length > 0
}

/** The `ask` event for a recorded call, or null when its arguments are not
 *  readable — a transcript from an older build, or a call that never validated. */
export function askFromCall(id: string, args: unknown): UiEvent | null {
  const questions = (args as { questions?: unknown })?.questions
  if (!Array.isArray(questions) || questions.length === 0) return null

  return { kind: 'ask', id, questions: questions as AskQuestion[] }
}

/** The `ask-answered` event for a recorded result.
 *
 *  A result that cannot be read is reported as ended rather than guessed at: a
 *  card claiming an answer nobody gave is worse than one saying the turn ended
 *  under it. */
export function answerFromResult(id: string, result: unknown): UiEvent {
  const said = readResult(result)

  if (!said) return ended(id, ENDED_UNSAID)
  if (said.cancelled === true) {
    return said.said !== undefined
      ? { kind: 'ask-answered', id, outcome: 'cancelled', answers: [], said: said.said }
      : ended(id, said.reason ?? ENDED_UNSAID)
  }
  if (!Array.isArray(said.answers)) return ended(id, ENDED_UNSAID)

  return { kind: 'ask-answered', id, outcome: 'answered', answers: said.answers }
}

/** A call that never reported back at all: the app quit under it. */
export function endedUnanswered(id: string): UiEvent {
  return ended(id, ENDED_UNSAID)
}

function ended(id: string, reason: string): UiEvent & { outcome: AskOutcome } {
  return { kind: 'ask-answered', id, outcome: 'ended', answers: [], reason }
}

interface Recorded {
  answers?: AskAnswer[]
  cancelled?: true
  said?: string
  reason?: string
}

/** The tool's own JSON, wherever pi put it: as text content, or as the details
 *  it kept beside them. */
function readResult(result: unknown): Recorded | null {
  const record = result as { details?: unknown; content?: unknown } | null
  if (record && typeof record === 'object') {
    if (record.details && typeof record.details === 'object') return record.details as Recorded

    const text = firstText(record.content)
    if (text !== null) {
      try {
        return JSON.parse(text) as Recorded
      } catch {
        return null
      }
    }
  }
  return null
}

function firstText(content: unknown): string | null {
  if (!Array.isArray(content)) return null

  for (const part of content) {
    const text = (part as { type?: string; text?: unknown }).text
    if (typeof text === 'string') return text
  }
  return null
}
