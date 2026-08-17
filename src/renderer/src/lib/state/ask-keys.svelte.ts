/** Who owns `j` and `k` when a question is waiting.
 *
 *  A pending question takes the choice keys in its own column the moment it
 *  arrives — that is what saves the reader a jump key to learn. `esc` hands
 *  them back to the blocks with the question still pending, and `enter` from
 *  NORMAL takes them again.
 *
 *  The rule is per thread rather than global: another column's question does
 *  not touch the keys of the one being read. */

import type { AskAnswer } from '../../../../shared/vocabulary'
import { app } from './app.svelte'
import { asks } from './ask.svelte'
import { threads } from './threads.svelte'

class AskKeys {
  /** Threads whose reader pressed `esc`, keyed by the ask they released. A new
   *  question is a new id, so it takes the keys even in a thread whose last
   *  question was released. */
  #released = $state.raw<Record<string, string>>({})

  /** The oldest unanswered ask in a thread, or null.
   *
   *  Oldest rather than newest: two calls in one turn each draw a card, and the
   *  one the reader should be answering is the one that has been waiting. */
  pendingIn(threadId: string): string | null {
    if (threadId === '') return null

    for (const block of threads.get(threadId).blocks) {
      if (block.kind === 'ask' && block.outcome === undefined) return block.id
    }
    return null
  }

  /** The ask holding the focused column's keys, or null when none is. */
  get holding(): string | null {
    const threadId = app.thread.id
    const askId = this.pendingIn(threadId)
    if (askId === null) return null
    return this.#released[threadId] === askId ? null : askId
  }

  /** Whether this card is the one with the keys. */
  focused(threadId: string, askId: string): boolean {
    return threadId === app.thread.id && this.holding === askId
  }

  /** `esc`: the blocks get their keys back, the question stays pending. */
  release(): void {
    const askId = this.holding
    if (askId === null) return
    this.#released = { ...this.#released, [app.thread.id]: askId }
  }

  /** `enter` from NORMAL: take them again. */
  resume(): boolean {
    const threadId = app.thread.id
    const askId = this.pendingIn(threadId)
    if (askId === null || this.holding !== null) return false

    const next = { ...this.#released }
    delete next[threadId]
    this.#released = next
    return true
  }

  /** Drops what a closed thread was holding. */
  forget(threadId: string): void {
    if (!(threadId in this.#released)) return
    const next = { ...this.#released }
    delete next[threadId]
    this.#released = next
  }

  /** One key for the card that has them. Returns false when the key was not
   *  ours, so the shell can carry on with it. */
  handleKey(event: { key: string; shiftKey?: boolean }): boolean {
    const askId = this.holding
    if (askId === null) return false

    const threadId = app.thread.id
    const block = threads.get(threadId).blocks.find((one) => one.id === askId)
    if (!block || block.kind !== 'ask') return false

    const flow = asks.flow(askId, block.questions)

    // The field owns every printable key while the caret is in it, which is
    // what lets a branch name or a sentence be typed without `j` moving
    // anything underneath it.
    if (flow.typing) {
      if (event.key === 'Escape') {
        // Out of the field, still in the question. A reader mid-sentence is not
        // asking to leave.
        if (flow.question?.kind === 'text') this.release()
        else flow.stopTyping()
        return true
      }
      if (event.key === 'Backspace') {
        flow.backspace()
        return true
      }
      if (event.key.length === 1 && event.key !== ' ') {
        flow.type(event.key)
        return true
      }
      if (event.key === ' ') {
        flow.type(' ')
        return true
      }
    }

    switch (event.key) {
      case 'Escape':
        this.release()
        return true
      case 'j':
      case 'ArrowDown':
        flow.move(1)
        return true
      case 'k':
      case 'ArrowUp':
        flow.move(-1)
        return true
      case ' ':
        flow.toggle()
        return true
      case 'o':
        flow.other()
        return true
      case 'Tab':
        // Back a step, to change an answer. Forward is `enter`, which also
        // takes what is on screen — a second forward key would let a reader
        // walk past a question without answering it.
        if (event.shiftKey) flow.step(-1)
        return true
      case 'Enter':
        this.#advance(threadId, askId, flow)
        return true
    }

    // Everything else is swallowed: the card is holding the keys, and a
    // stray letter must not move the column behind it.
    return true
  }

  #advance(threadId: string, askId: string, flow: ReturnType<typeof asks.flow>): void {
    // A single-choice question with nothing picked takes what the cursor is on:
    // `enter` on a highlighted option is what everyone expects it to mean.
    if (flow.question?.kind === 'one' && !flow.ready) flow.toggle()
    if (!flow.ready) return

    if (!flow.last) {
      flow.step(1)
      return
    }

    this.#submit(threadId, askId, flow.answers())
  }

  #submit(threadId: string, askId: string, answers: AskAnswer[]): void {
    threads.answer(threadId, askId, answers)
    asks.forget(askId)
    this.forget(threadId)
  }
}

export const askKeys = new AskKeys()
