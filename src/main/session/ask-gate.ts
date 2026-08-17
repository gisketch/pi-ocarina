/** The questions an agent has asked, and the people who have not answered yet.
 *
 *  Shaped like `ApprovalGate`, and for the same reason: a tool call that must
 *  wait for a person is a promise held open in main, released by a command from
 *  the renderer. Keeping both in the same shape is what lets a thread close, a
 *  turn cancel or an app quit release every waiting call the same way.
 *
 *  pi 0.84 has no elicitation of its own, so this is the whole of it. */

import type { AskAnswer, AskQuestion } from '../../shared/vocabulary'
import type { UiEvent } from '../../shared/protocol'

/** What the model gets back. One entry per question, keyed by the question's
 *  own id — a model branches on ids and reads labels, and never counts
 *  positions. */
export interface AskResult {
  answers: AskAnswer[]
  /** Set when nobody answered: the reader said something else, or the turn
   *  ended under the question. */
  cancelled?: true
  /** What they said instead, when they said something. */
  said?: string
  reason?: string
}

interface Pending {
  threadId: string
  askId: string
  questions: AskQuestion[]
  settle: (result: AskResult) => void
}

/** A question the model asked badly, said plainly enough that it can fix it. */
export function faultIn(questions: unknown): string | null {
  if (!Array.isArray(questions) || questions.length === 0) {
    return 'ask_user needs at least one question'
  }

  const seen = new Set<string>()
  for (const raw of questions) {
    const question = raw as Partial<AskQuestion>
    if (typeof question?.id !== 'string' || question.id === '') return 'every question needs an id'
    if (seen.has(question.id)) return `two questions share the id "${question.id}"`
    seen.add(question.id)

    if (typeof question.prompt !== 'string' || question.prompt.trim() === '') {
      return `question "${question.id}" has no prompt`
    }
    if (question.kind !== 'one' && question.kind !== 'many' && question.kind !== 'text') {
      return `question "${question.id}" has an unknown kind`
    }
    if (question.kind === 'text') continue

    const choices = question.choices
    if (!Array.isArray(choices) || choices.length === 0) {
      return `question "${question.id}" is a choice question with no choices`
    }
    const ids = new Set<string>()
    for (const choice of choices) {
      if (typeof choice?.id !== 'string' || choice.id === '') {
        return `a choice in "${question.id}" has no id`
      }
      if (typeof choice?.title !== 'string' || choice.title.trim() === '') {
        return `choice "${choice.id}" in "${question.id}" has no title`
      }
      if (ids.has(choice.id)) return `two choices in "${question.id}" share the id "${choice.id}"`
      ids.add(choice.id)
    }
  }
  return null
}

export class AskGate {
  readonly #pending = new Map<string, Pending>()
  #counter = 0

  readonly #emit: (threadId: string, event: UiEvent) => void

  constructor(emit: (threadId: string, event: UiEvent) => void) {
    this.#emit = emit
  }

  /** Publishes the questions and waits. The promise is the tool call. */
  ask(threadId: string, questions: AskQuestion[]): Promise<AskResult> {
    this.#counter += 1
    const askId = `ask-${this.#counter}`

    this.#emit(threadId, { kind: 'ask', id: askId, questions })

    return new Promise<AskResult>((resolve) => {
      this.#pending.set(askId, { threadId, askId, questions, settle: resolve })
    })
  }

  /** The reader answered in the card.
   *
   *  The thread is named as well as the ask: ids are unique in this process
   *  today, and a guard costs nothing against the day they are not — one
   *  thread resolving another's question would be silent and wrong. */
  answer(threadId: string, askId: string, answers: AskAnswer[]): void {
    const pending = this.#pending.get(askId)
    if (!pending || pending.threadId !== threadId) return
    this.#pending.delete(askId)

    this.#emit(pending.threadId, { kind: 'ask-answered', id: askId, outcome: 'answered', answers })
    pending.settle({ answers })
  }

  /** The reader typed prose instead: none of the above, and here is what they
   *  actually want. The message goes to the model on its own; this only says
   *  the question is over. */
  cancel(threadId: string, said: string): void {
    for (const [askId, pending] of [...this.#pending]) {
      if (pending.threadId !== threadId) continue
      this.#pending.delete(askId)
      this.#emit(threadId, {
        kind: 'ask-answered',
        id: askId,
        outcome: 'cancelled',
        answers: [],
        said,
      })
      pending.settle({ answers: [], cancelled: true, said })
    }
  }

  /** The turn ended under it — cancelled, closed, or the app quitting.
   *
   *  Resolves rather than throws: a tool that throws teaches a model to try the
   *  same call again, and there is nobody left to answer it. */
  end(threadId: string, reason: string): void {
    for (const [askId, pending] of [...this.#pending]) {
      if (pending.threadId !== threadId) continue
      this.#pending.delete(askId)
      this.#emit(threadId, {
        kind: 'ask-answered',
        id: askId,
        outcome: 'ended',
        answers: [],
        reason,
      })
      pending.settle({ answers: [], cancelled: true, reason })
    }
  }

  /** Whether this thread is waiting on anyone. */
  pendingFor(threadId: string): boolean {
    return [...this.#pending.values()].some((pending) => pending.threadId === threadId)
  }

  get pendingCount(): number {
    return this.#pending.size
  }
}
