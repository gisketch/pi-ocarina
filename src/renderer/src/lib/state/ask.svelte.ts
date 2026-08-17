/** Walking a card's questions, one at a time.
 *
 *  Held apart from the card because the keys are not the card's: a question
 *  takes `j` and `k` from the column it is in, and the shell's reducer has to
 *  be able to ask what those keys should do without rendering anything.
 *
 *  One flow per ask, keyed by the ask's id. A thread can hold two asks — two
 *  calls in one turn — and each keeps its own place; the card that has the keys
 *  is the oldest unanswered one, which the thread decides, not this. */

import type { AskAnswer, AskQuestion } from '../../../../shared/vocabulary'

/** The id a free-text answer to a choice question comes back under. Fixed
 *  rather than caller-chosen: the model reads it to know the reader went
 *  off-menu, and a caller could otherwise use it for a real choice. */
export const OTHER = 'other'

class Flow {
  readonly questions: readonly AskQuestion[]
  /** Which question the reader is on. */
  at = $state(0)
  /** The choice the cursor is on, within the current question. `-1` is the
   *  free-text row, when the question offers one. */
  cursor = $state(0)
  /** Choice ids picked, per question id. */
  picked = $state.raw<Record<string, string[]>>({})
  /** Free text, per question id: the answer to a `text` question, or what was
   *  typed into a choice question's other row. */
  typed = $state.raw<Record<string, string>>({})
  /** Whether the caret is in a text field, so the shell knows every key
   *  belongs to it rather than to the choices. */
  typing = $state(false)

  constructor(questions: readonly AskQuestion[]) {
    this.questions = questions
    this.cursor = questions[0]?.kind === 'text' ? -1 : 0
    this.typing = questions[0]?.kind === 'text'
  }

  get question(): AskQuestion | undefined {
    return this.questions[this.at]
  }

  get last(): boolean {
    return this.at === this.questions.length - 1
  }

  /** The rows the cursor can stand on: the choices, then the other row. */
  get rows(): number {
    const question = this.question
    if (!question || question.kind === 'text') return 0
    return (question.choices?.length ?? 0) + (question.allowOther ? 1 : 0)
  }

  /** Whether the current question has enough to move on. */
  get ready(): boolean {
    const question = this.question
    if (!question) return false
    if (question.optional) return true

    if (question.kind === 'text') return (this.typed[question.id] ?? '').trim() !== ''

    const picked = this.picked[question.id] ?? []
    if (picked.length === 0) return false
    if (picked.includes(OTHER)) return (this.typed[question.id] ?? '').trim() !== ''
    return true
  }

  /** Puts the cursor on a row, from the pointer.
   *
   *  The same seam the keys use, and for the same reason they use it: clicking
   *  a choice after the free-text field used to move the cursor and leave the
   *  caret's flag on, so the next `j` was typed into the answer — the very bug
   *  `move` was changed to stop, coming back through the mouse. */
  moveTo(index: number): void {
    this.cursor = index
    this.typing = false
  }

  move(delta: number): void {
    const rows = this.rows
    if (rows === 0) return

    const other = this.question?.allowOther ? 1 : 0
    const choices = rows - other
    // The other row sits after the choices and is numbered -1, so walking off
    // the end lands on it rather than wrapping past it.
    const order = [...Array.from({ length: choices }, (_, at) => at), ...(other ? [-1] : [])]
    const now = order.indexOf(this.cursor)
    const next = Math.max(0, Math.min(order.length - 1, (now === -1 ? 0 : now) + delta))

    // Leaving the free-text row with nothing in it gives the pick back, or the
    // question stays unanswerable behind text nobody typed.
    if (this.cursor === -1 && order[next] !== -1) this.#dropEmptyOther()

    this.cursor = order[next]
    // Moving the cursor never starts typing, not even onto the free-text row.
    // It used to, and the next `k` was typed into the field instead of moving
    // up — the reader had entered a mode they never asked for. `l` or `i` is
    // what puts the caret in.
    this.typing = false
  }

  /** `space` on a choice, and what `enter` does on a `one` question. */
  toggle(): void {
    const question = this.question
    if (!question || question.kind === 'text') return

    const id = this.cursor === -1 ? OTHER : question.choices?.[this.cursor]?.id
    if (id === undefined) return

    const held = this.picked[question.id] ?? []
    if (question.kind === 'one') {
      this.picked = { ...this.picked, [question.id]: held[0] === id ? [] : [id] }
      return
    }

    this.picked = {
      ...this.picked,
      [question.id]: held.includes(id) ? held.filter((one) => one !== id) : [...held, id],
    }
  }

  /** Puts the caret in the row the cursor is already on, when that row has a
   *  field. `l` and `i` both mean this; `esc` takes it back out. */
  startTyping(): boolean {
    const question = this.question
    if (!question) return false

    if (question.kind === 'text') {
      this.typing = true
      return true
    }
    if (this.cursor !== -1 || !question.allowOther) return false

    this.other()
    return true
  }

  /** `o`: take the free-text row, wherever the cursor was. */
  other(): void {
    const question = this.question
    if (!question) return
    if (question.kind === 'text') {
      this.typing = true
      return
    }
    if (!question.allowOther) return

    this.cursor = -1
    this.typing = true
    const held = this.picked[question.id] ?? []
    if (!held.includes(OTHER)) {
      this.picked = {
        ...this.picked,
        [question.id]: question.kind === 'one' ? [OTHER] : [...held, OTHER],
      }
    }
  }

  write(text: string): void {
    const question = this.question
    if (!question) return
    this.typed = { ...this.typed, [question.id]: text }
  }

  /** One typed character, for the shell's key path. */
  type(character: string): void {
    const question = this.question
    if (!question) return
    this.write((this.typed[question.id] ?? '') + character)
  }

  backspace(): void {
    const question = this.question
    if (!question) return
    this.write((this.typed[question.id] ?? '').slice(0, -1))
  }

  /** Leaves the field without leaving the question.
   *
   *  An empty free-text row gives up its pick on the way out. Keeping it made a
   *  `many` question unanswerable: `ready` demands text once OTHER is picked, so
   *  a reader who opened the field, typed nothing and moved on could pick every
   *  real choice and still not be allowed to send. */
  stopTyping(): void {
    if (this.question?.kind === 'text') return
    this.typing = false
    this.#dropEmptyOther()
    if (this.cursor === -1) this.cursor = 0
  }

  /** Drops an `other` pick that has no text behind it. */
  #dropEmptyOther(): void {
    const question = this.question
    if (!question || (this.typed[question.id] ?? '').trim() !== '') return

    const held = this.picked[question.id] ?? []
    if (!held.includes(OTHER)) return
    this.picked = { ...this.picked, [question.id]: held.filter((one) => one !== OTHER) }
  }

  step(delta: number): void {
    const next = Math.max(0, Math.min(this.questions.length - 1, this.at + delta))
    if (next === this.at) return

    this.at = next
    const question = this.questions[next]
    this.cursor = question.kind === 'text' ? -1 : 0
    this.typing = question.kind === 'text'
  }

  /** Every answer, in the order the questions were asked. */
  answers(): AskAnswer[] {
    return this.questions.map((question) => {
      const text = (this.typed[question.id] ?? '').trim()

      if (question.kind === 'text') {
        if (text === '') return skipped(question)
        return { id: question.id, kind: question.kind, chosen: [], labels: [], text }
      }

      const picked = this.picked[question.id] ?? []
      if (picked.length === 0) return skipped(question)

      const labels = picked.map(
        (id) => question.choices?.find((choice) => choice.id === id)?.title ?? id,
      )
      const answer: AskAnswer = { id: question.id, kind: question.kind, chosen: picked, labels }
      // An off-menu answer carries both: the id says they went off the menu,
      // the text says what they wanted instead.
      return picked.includes(OTHER) ? { ...answer, text } : answer
    })
  }
}

/** What an answer reads like, from either side of the round trip.
 *
 *  The card before the answer reads it from the flow; the record after reads it
 *  from the answers. One function, so the two cannot disagree about the same
 *  choice — and an off-menu answer reads as what the reader typed in both. */
export function describeAnswer(
  question: AskQuestion,
  chosen: readonly string[],
  text: string,
): string {
  if (question.kind === 'text') return text.trim() === '' ? '—' : text
  if (chosen.length === 0) return '—'

  return chosen
    .map((id) =>
      id === OTHER
        ? text.trim() || 'something else'
        : (question.choices?.find((choice) => choice.id === id)?.title ?? id),
    )
    .join(', ')
}

/** A question nobody answered. Written out rather than left absent: a missing
 *  key reads as a bug, and "no preference" is not "never asked". */
function skipped(question: AskQuestion): AskAnswer {
  return { id: question.id, kind: question.kind, chosen: [], labels: [], skipped: true }
}

class Asks {
  readonly #flows = new Map<string, Flow>()

  /** The flow for an ask, made on first sight of it. */
  flow(askId: string, questions: readonly AskQuestion[]): Flow {
    const known = this.#flows.get(askId)
    if (known) return known

    const flow = new Flow(questions)
    this.#flows.set(askId, flow)
    return flow
  }

  /** A flow nobody keeps, for a card that is already a record: it renders from
   *  its answers, and asking for a real flow would put one back in the map. */
  spare(questions: readonly AskQuestion[]): Flow {
    return new Flow(questions)
  }

  /** Drops a flow whose card is answered or whose thread has gone. */
  forget(askId: string): void {
    this.#flows.delete(askId)
  }
}

export const asks = new Asks()
export type { Flow }
