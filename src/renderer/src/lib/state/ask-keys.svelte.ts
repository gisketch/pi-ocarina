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
import { askNotice } from './ask-notice.svelte'
import { revealBlock } from './block-focus.svelte'
import { threads } from './threads.svelte'

class AskKeys {
  /** Threads whose reader pressed `esc`, keyed by the ask they released. A new
   *  question is a new id, so it takes the keys even in a thread whose last
   *  question was released. */
  #released = $state.raw<Record<string, string>>({})
  /** Asks answered here, before their `ask-answered` has come back from main.
   *
   *  Without this the card stays the holder for the length of the round trip,
   *  and a second `enter` in that window answers a freshly built flow — a
   *  different answer set, for a question the reader thinks they have already
   *  sent. */
  readonly #submitted = new Set<string>()

  /** The oldest unanswered ask in a thread, or null.
   *
   *  Oldest rather than newest: two calls in one turn each draw a card, and the
   *  one the reader should be answering is the one that has been waiting. */
  pendingIn(threadId: string): string | null {
    if (threadId === '') return null
    return threads.get(threadId).pendingAskId ?? null
  }

  /** The ask holding the focused column's keys, or null when none is. */
  get holding(): string | null {
    const threadId = app.thread.id
    const askId = this.pendingIn(threadId)
    if (askId === null || this.#submitted.has(askId)) return null
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
    // Nothing to resume while an answer is on its way: the question is over,
    // whatever the events have not said yet.
    if (askId === null || this.#submitted.has(askId) || this.holding !== null) return false

    const next = { ...this.#released }
    delete next[threadId]
    this.#released = next
    return true
  }

  /** Drops what a closed thread was holding, answer in flight included. */
  forget(threadId: string): void {
    const pending = this.pendingIn(threadId)
    if (pending !== null) this.#submitted.delete(pending)

    if (!(threadId in this.#released)) return
    const next = { ...this.#released }
    delete next[threadId]
    this.#released = next
  }

  /** One key for the card that has them. Returns false when the key was not
   *  ours, so the shell can carry on with it. */
  handleKey(event: {
    key: string
    target?: unknown
    shiftKey?: boolean
    metaKey?: boolean
    ctrlKey?: boolean
    altKey?: boolean
  }): boolean {
    // Never while a real field has the caret — the card's own text inputs
    // included. Their keys are already the browser's to handle, and taking
    // them here would type every character twice.
    if (isEditable(event.target)) return false

    // Never while the composer has the caret. Every other modal in the shell is
    // opened by the reader, so outranking INSERT is what they are for; a
    // question arrives on its own, and taking the keys from someone mid-sentence
    // would be the app typing over them.
    if (app.mode === 'INSERT') return false

    // A modifier is not an answer, and never a choice key: ⌘k belongs to the
    // command palette, not to a cursor.
    if (event.metaKey === true || event.ctrlKey === true || event.altKey === true) return false

    const askId = this.holding
    if (askId === null) return false

    const threadId = app.thread.id

    // The reader is scrolled up with the "a question below" bar showing. The
    // key that bar advertises must take them to the question, not answer one
    // they have not read — on a two-choice question, blind, that is a coin
    // flip the model would act on.
    if (askNotice.belowIn(threadId)) {
      if (event.key === 'Enter') {
        revealBlock(threadId, askId, 'nearest')
        askNotice.seen(threadId)
        return true
      }
      return false
    }
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
      case 'i':
        // Into the field on the row the cursor is on. Nothing happens on a row
        // that has no field, rather than something surprising.
        return flow.startTyping()
      case 'l':
      case 'ArrowRight':
        // Right means forward: into the field when the row has one, on to the
        // next question when it does not. Never to the next column — a card
        // holding the keys owns them, and `esc` is how a reader leaves.
        if (flow.startTyping()) return true
        this.#advance(threadId, askId, flow)
        return true
      case 'h':
      case 'ArrowLeft':
        // Back a question, the mirror of `l`. Also what `⇧⇥` does.
        flow.step(-1)
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

    // Everything else belongs to the strip. The card took the cursor keys and
    // the answer keys; it did not take the workspace digits, so a reader is
    // never pinned to the asking column — `esc` and `1`–`3` both leave.
    return false
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
    // Released state first, then the mark — `forget` clears an answer in
    // flight, which is exactly what this is about to become.
    this.forget(threadId)
    this.#submitted.add(askId)
    threads.answer(threadId, askId, answers)
    // The flow is dropped when `ask-answered` comes back, not here: dropping it
    // now would have the card rebuild an empty one and redraw itself at 1 / N
    // for the length of the round trip.
  }

  /** An ask has ended, however it ended. */
  settle(askId: string): void {
    this.#submitted.delete(askId)
  }
}

/** Whether the key was typed into something that takes typing. */
function isEditable(target: unknown): boolean {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null
  const tag = typeof element?.tagName === 'string' ? element.tagName : ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || element?.isContentEditable === true
}

export const askKeys = new AskKeys()
