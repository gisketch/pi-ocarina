/** `ask_user`: the tool that lets an agent stop and ask a real question.
 *
 *  Registered in every session this app starts. pi's `ToolDefinition.execute`
 *  returns a promise, so the call simply waits for a person — the same trick
 *  the approval gate plays on `tool_call`.
 *
 *  The description below is the whole product. A tool that asks too often
 *  teaches the reader to stop reading the cards; one that never asks is one
 *  that guesses. It is one string, and it is meant to be tuned against real
 *  use rather than argued about in advance. */

// A devDependency on purpose: `externalizeDepsPlugin` externalizes what is in
// `dependencies`, so this is bundled into `dist/main` and a packaged app that
// ships without devDependencies still starts. Pinned to the version pi
// resolves, so the schema this builds is the schema pi validates.
import { Type, type Static } from 'typebox'
import type { AskQuestion } from '../../shared/vocabulary'
import type { AskGate } from './ask-gate'
import { faultIn } from './ask-gate'
import type { ThreadHandle } from './session-factory'

const DESCRIPTION = `Ask the user a question. They are at the keyboard and will answer.

This is the only way to ask them anything. A question written into your reply is not a question: the turn ends, the thread goes quiet, and nobody is told that you are waiting.

Ask whenever the work in front of you contains a decision you would otherwise guess at: which of several approaches to take, what something should be called, whether a tradeoff is acceptable, which of two readings of an ambiguous request is meant. Ask before doing the work, not after — a guess you have already built is expensive to undo.

Do not ask what the repository can answer: read the code instead. Do not ask permission for work you were already told to do. Do not ask to report progress.

A single call may carry several questions; ask them all at once rather than in a run of separate calls. Every question and every choice needs a stable id, because that is what comes back to you.`

/** The input schema, in the schema library pi validates with.
 *
 *  TypeBox rather than a plain object: pi compiles this, and a JSON-shaped
 *  literal without TypeBox's own metadata is not a schema it can compile. */
const CHOICE = Type.Object({
  id: Type.String({ description: 'Stable id; this is what comes back to you.' }),
  title: Type.String({ description: 'What the reader reads.' }),
  description: Type.Optional(
    Type.String({ description: 'Subtext under the title — the tradeoff, in a phrase.' }),
  ),
})

const QUESTION = Type.Object({
  id: Type.String({ description: 'Stable id; answers come back keyed by it.' }),
  kind: Type.Union([Type.Literal('one'), Type.Literal('many'), Type.Literal('text')], {
    description: 'Pick one, pick several, or free text.',
  }),
  prompt: Type.String({ description: 'The question itself, in one line.' }),
  description: Type.Optional(
    Type.String({ description: 'Lighter text under the prompt, for what a line cannot say.' }),
  ),
  choices: Type.Optional(Type.Array(CHOICE, { description: 'Required for `one` and `many`.' })),
  allowOther: Type.Optional(
    Type.Boolean({ description: 'Offer a free-text option beside the choices.' }),
  ),
  optional: Type.Optional(Type.Boolean({ description: 'The reader may pass over it.' })),
})

const PARAMETERS = Type.Object({
  questions: Type.Array(QUESTION, {
    minItems: 1,
    description: 'The questions to ask, walked one at a time by the reader.',
  }),
})

/** The tool, bound to the gate that holds its answers and to the thread it
 *  belongs to. `handle` rather than a thread id because on a new session the
 *  id only exists once pi has finished building the session this extension is
 *  part of. */
export function askUserTool(asks: AskGate, handle: ThreadHandle) {
  return {
    name: 'ask_user',
    label: 'Ask',
    description: DESCRIPTION,
    promptSnippet: 'ask_user — ask the user a question only they can answer',
    // pi appends these to the system prompt while the tool is active. The
    // description is read when the model is already reaching for a tool; this
    // is what makes it reach in the first place, and the live discipline pass
    // showed the difference — without it the model wrote the question into its
    // reply and ended the turn.
    promptGuidelines: [
      'Never end a reply with a question. If you are about to ask the user anything — which approach, what to call it, whether a tradeoff is acceptable — call ask_user instead. A question in prose ends the turn and nobody is told you are waiting.',
      'Ask before doing the work rather than after: a guess already built is expensive to undo.',
    ],
    parameters: PARAMETERS,
    // One at a time: two questions racing each other would put two cards on
    // screen with one reader in front of them.
    executionMode: 'sequential' as const,
    execute: async (
      _toolCallId: string,
      params: Static<typeof PARAMETERS>,
      signal: AbortSignal | undefined,
    ) => {
      const fault = faultIn(params?.questions)
      // A malformed call is answered rather than thrown: the model can fix a
      // sentence, and a throw would read to it as the tool being broken.
      if (fault !== null) return said({ error: fault })

      const questions = params.questions as AskQuestion[]
      const threadId = handle.threadId

      const result = await Promise.race([
        asks.ask(threadId, questions),
        aborted(signal).then(() => {
          // The turn was cancelled under the question. The gate publishes the
          // record and releases anything else waiting on this thread.
          asks.end(threadId, 'turn cancelled')
          return { answers: [], cancelled: true as const, reason: 'turn cancelled' }
        }),
      ])

      return said(result)
    },
  }
}

/** pi wants content blocks; the model wants JSON. Both, once. */
function said(result: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result }
}

/** Resolves when the turn is aborted, and never otherwise. */
function aborted(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise<void>(() => {})
  if (signal.aborted) return Promise.resolve()

  return new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}
