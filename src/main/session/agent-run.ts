/** Driving one child session, and reading what it did.
 *
 *  Split from the fleet because the fleet is bookkeeping — the cap, the names,
 *  the bill — and this is the part that actually talks to a session: subscribe,
 *  prompt, relay the rows, and work out what the child ended up saying.
 *
 *  Nothing here knows about other children. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { EmitEvent } from '../../shared/protocol'
import type { AgentUsage } from '../../shared/vocabulary'
import { PiTranslator } from './pi-translate'

/** What a child's own calls are allowed to put in the parent's transcript:
 *  rows, and nothing else. Its messages, its usage and its turn boundaries
 *  belong to it. */
const ROW_EVENTS = new Set(['tool-progress', 'tool-body', 'tool-end'])

export interface Ran {
  /** The child's final message, or '' when it never said anything. */
  said: string
  /** The model's own error, when that is why it said nothing. */
  broke: string
  usage: AgentUsage
}

/** Runs the child's turn, relaying its rows under `childId`.
 *
 *  Resolves when the turn is over, however it ended. Cancellation is the
 *  caller's: it aborts the session, and this simply returns what there was. */
export async function driveChild(options: {
  session: AgentSession
  threadId: string
  childId: string
  task: string
  usage: AgentUsage
  emit: EmitEvent
  /** Whether the approval gate stopped a call. pi reports every failure the
   *  same way, so without this a call the reader refused reads as one that
   *  broke — and the gate's record of it is never consumed, which leaks. */
  wasBlocked: (toolCallId: string) => boolean
  /** Told what the child has spent so far, each time a model message closes.
   *
   *  The peek is opened *while* a child runs, and until this existed the only
   *  figure it could read was the one handed back at settle — so it showed
   *  zeros for the whole window it was open for, then the truth a moment after
   *  it stopped mattering. Handed a copy, never the accumulator: the caller
   *  puts it in an entry it emits, and a shared object would keep changing
   *  underneath a value already sent. */
  onUsage?: (usage: AgentUsage) => void
}): Promise<Ran> {
  const { session, threadId, childId, task, emit } = options
  const usage = { ...options.usage }
  let said = ''
  let broke = ''

  // A fresh translator per child: it holds per-session state, and two children
  // sharing one would close each other's calls.
  const translator = new PiTranslator(() => undefined, options.wasBlocked)
  const unsubscribe = session.subscribe((event) => {
    for (const translated of translator.translate(event)) {
      if (translated.kind === 'tool-start') {
        emit(threadId, { ...translated, parentId: childId })
        continue
      }
      // Rows only. A child's prose is its report, and the parent reads it as
      // the entry's output rather than as messages in the parent's transcript.
      if (ROW_EVENTS.has(translated.kind)) emit(threadId, translated)
    }

    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const text = textOf(event.message)
      if (text) said = text
      // A child whose model call failed says nothing at all, and an entry
      // reading `fail` with an empty output tells nobody why. pi puts the
      // reason on the message; without this it is lost and the parent model
      // retries the same broken spawn.
      const failure = (event.message as { errorMessage?: unknown }).errorMessage
      if (typeof failure === 'string' && failure !== '') broke = failure
      add(usage, event.message.usage)
      options.onUsage?.({ ...usage })
    }
  })

  try {
    await session.prompt(task)
  } finally {
    // Calls pi abandoned when the turn was aborted report nothing, so they are
    // settled here. Without this a cancelled child leaves rows pulsing forever
    // under a row that has already stopped.
    for (const event of translator.abandonOpenTools()) emit(threadId, event)
    unsubscribe()
  }

  return { said, broke, usage }
}

/** Adds pi's usage for one message into the running total, in place. */
function add(usage: AgentUsage, more: unknown): void {
  const one = more as
    | {
        input?: number
        output?: number
        cacheRead?: number
        cacheWrite?: number
        cost?: { total?: number }
      }
    | undefined
  if (!one) return

  usage.input += one.input ?? 0
  usage.output += one.output ?? 0
  usage.cacheRead += one.cacheRead ?? 0
  usage.cacheWrite += one.cacheWrite ?? 0
  usage.cost += one.cost?.total ?? 0
}

function textOf(message: unknown): string {
  const content = (message as { content?: unknown })?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter((part) => (part as { type?: string }).type === 'text')
    .map((part) => String((part as { text?: unknown }).text ?? ''))
    .join('')
    .trim()
}
