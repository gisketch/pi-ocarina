/** Naming threads: the hand rename, and the machine's first guess.
 *
 *  The name lives in pi's session file (`session_info`), which is the same
 *  place the listing reads it back from — there is no second store to
 *  disagree. A hand-given name is final; the titler only ever names a session
 *  that has none.
 *
 *  The auto title is Claude Code's shape: the first message goes, in
 *  parallel with the turn it started, to a small cheap model whose one job is
 *  a one-line summary. Fire and forget — a title that never arrives costs
 *  nothing, because the first-line fallback is already on screen. */

import type { EmitEvent } from '../../shared/protocol'
import type { TitleSettings } from '../../shared/config-file'
import type { PiModelLike } from './models'
import type { SessionFactory } from './session-factory'
import type { Thread } from './thread-registry'

/** The longest a header line is worth. Longer survives in the session file,
 *  but the column truncates it anyway, so the model is asked for less and the
 *  hand is cut here. */
const TITLE_MAX = 80

/** How much of the first message the titler reads. Enough to know what the
 *  work is; a pasted log does not get shipped wholesale to a second model. */
const PROMPT_MAX = 2000

/** One line fit for a column header, or null when nothing survives.
 *
 *  Models dress an answer up — quotes, backticks, a trailing period, a
 *  "Title:" prefix — and every dressing would sit in the header verbatim. */
export function sanitizeTitle(said: string): string | null {
  const line = said
    .split('\n')
    .map((one) => one.trim())
    .find((one) => one.length > 0)
  if (!line) return null

  const undressed = line
    .replace(/^title\s*[:\-–]\s*/i, '')
    .replace(/^["'`“”]+/, '')
    .replace(/["'`“”]+$/, '')
    .replace(/[.。]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (undressed === '') return null
  return undressed.length > TITLE_MAX ? `${undressed.slice(0, TITLE_MAX - 1).trimEnd()}…` : undressed
}

/** Which model writes titles, as `provider/id`, or undefined for pi's default.
 *
 *  The reader's own choice wins. Without one: GPT-5.6 Luna when this machine
 *  has it, because it is fast and good at exactly this; otherwise the cheapest
 *  model pi has credentials for. Undefined only when there is nothing to pick
 *  from, and then pi's session default carries it. */
export function pickTitleModel(
  models: readonly PiModelLike[],
  named?: string,
): string | undefined {
  if (named) return named

  const luna = models.find((model) => `${model.id} ${model.name}`.toLowerCase().includes('luna'))
  if (luna) return `${luna.provider}/${luna.id}`

  // Cheapest among the *priced* models. A $0 entry is usually a local or
  // half-configured one, and "cheapest" picking a model that cannot answer
  // is a titler that silently never works.
  let cheapest: PiModelLike | undefined
  for (const model of models) {
    const price = model.cost?.input ?? 0
    if (price <= 0) continue
    if (!cheapest || price < (cheapest.cost?.input ?? 0)) cheapest = model
  }
  const picked = cheapest ?? models[0]
  return picked ? `${picked.provider}/${picked.id}` : undefined
}

/** Names a thread by hand. The one writer besides the titler, and it wins:
 *  `appendSessionInfo` is append-only, and the newest entry is the name. */
export function renameThread(
  emit: EmitEvent,
  threadId: string,
  thread: Thread,
  title: string,
): void {
  const clean = sanitizeTitle(title)
  if (clean === null) return

  thread.session.sessionManager.appendSessionInfo(clean)
  emit(threadId, { kind: 'titled', title: clean })
}

export interface TitlerDeps {
  sessions: SessionFactory
  emit: EmitEvent
  titles: () => TitleSettings
}

/** Whether this prompt should start the titler: the first of the session, on a
 *  session nobody has named. `prompts` is per-process, so an old unnamed
 *  thread gets its chance on reopen too — which is a feature, not a leak. */
export function wantsTitle(thread: Thread): boolean {
  return thread.prompts === 1 && thread.session.sessionManager.getSessionName() === undefined
}

/** Runs the one-shot and writes what it said. Never throws: a title is a
 *  nicety, and the turn it rode in on must not hear about its failure. */
export async function autoTitle(
  deps: TitlerDeps,
  threadId: string,
  thread: Thread,
  cwd: string,
  firstMessage: string,
): Promise<void> {
  const settings = deps.titles()
  if (settings.enabled === false) return

  try {
    const model = pickTitleModel(await deps.sessions.models(), settings.model)
    const oneShot = await deps.sessions.oneShot(cwd, model)

    let said = ''
    const unsubscribe = oneShot.subscribe((event) => {
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const text = textOf(event.message)
        if (text) said = text
      }
    })
    try {
      await oneShot.prompt(
        'Name this conversation thread from its first message below. ' +
          'Reply with the title only: 3 to 8 words, one line, plain text, ' +
          'no quotes, no trailing period. Say what the work is about.\n\n' +
          firstMessage.slice(0, PROMPT_MAX),
      )
    } finally {
      unsubscribe()
    }

    const title = sanitizeTitle(said)
    if (title === null) return
    // The reader may have renamed the thread while the model was thinking.
    // Their name is final; the machine's guess is quietly dropped.
    if (thread.session.sessionManager.getSessionName() !== undefined) return

    thread.session.sessionManager.appendSessionInfo(title)
    deps.emit(threadId, { kind: 'titled', title })
  } catch (cause) {
    // The first-line fallback is already on screen, so the reader hears
    // nothing — but the terminal running the app does, or a titler that never
    // works is undiagnosable.
    console.warn('[titles] auto title failed:', cause instanceof Error ? cause.message : cause)
  }
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
