/** The four things that can be done to a thread that already exists.
 *
 *  Split from the driver on the line between "which command arrived" and "what
 *  that command does to a live pi session". The driver routes; this acts. Each
 *  takes what it needs, so none of them can reach for a piece of the driver it
 *  was not given. */

import type { EmitEvent } from '../../shared/protocol'
import type { AttachmentRef } from '../../shared/vocabulary'
import { describeAttachments, readImages } from './attachments'
import { replayInto } from './session-report'
import { expandSkillRefs } from './skill-refs'
import type { SteerQueue } from './steering'
import type { Thread } from './thread-registry'

/** Starts a turn.
 *
 *  Attachments are resolved before the turn begins: images become bytes pi can
 *  see, and everything else is named in the message for pi to open with its read
 *  tool — pi 0.84 takes text and images, and nothing else. */
export async function startTurn(
  emit: EmitEvent,
  threadId: string,
  thread: Thread,
  text: string,
  attachments: AttachmentRef[] = [],
): Promise<void> {
  const { session } = thread
  const images = await readImages(attachments)
  const prompt = text + describeAttachments(attachments)

  thread.lastPrompt = text
  thread.prompts += 1
  // The reader's own words, with the files beside them rather than described
  // in a paragraph underneath. pi still gets the whole prompt: it cannot see a
  // chip, and the names are how it refers to what it was given.
  emit(threadId, {
    kind: 'user-message',
    id: `user-${thread.prompts}`,
    text,
    ...(attachments.length > 0
      ? {
          attachments: attachments.map((one) => ({
            name: one.name,
            path: one.path,
            ...(one.mime ? { mime: one.mime } : {}),
          })),
        }
      : {}),
  })

  // Deliberately not awaited: a turn runs for minutes and the caller's IPC reply
  // must not wait for it. Progress and failure both arrive as events.
  // Skills the reader named inside the sentence. pi expands one, at position
  // zero; the composer lets them name several, anywhere.
  const said = expandSkillRefs(session, prompt)

  void session.prompt(said, images.length > 0 ? { images } : undefined).catch((error: unknown) => {
    emit(threadId, {
      kind: 'thread-state',
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    })
  })
}

/** Queues text for the running turn, or sends it as a prompt if nothing is
 *  running — the composer never has to know which case it is in. */
export async function steerTurn(
  emit: EmitEvent,
  steers: SteerQueue,
  threadId: string,
  thread: Thread,
  text: string,
): Promise<string> {
  const { session } = thread

  if (!session.isStreaming) {
    void startTurn(emit, threadId, thread, text)
    return ''
  }

  // The same expansion the prompt path does, and for a sharper reason:
  // `steer()` turns pi's own expansion *off* by default, so a skill named in a
  // queued message would reach the model as the literal `/skill:name`.
  const steerId = steers.add(threadId, text)
  await session.steer(expandSkillRefs(session, text))
  return steerId
}

/** Rewinds the conversation to a checkpoint — and only the conversation.
 *
 *  pi navigates within the session tree, so the abandoned branch is still on
 *  disk and nothing on the filesystem is touched. That is the honest promise the
 *  confirm dialog makes: your files keep their later edits. */
export async function restoreCheckpoint(
  emit: EmitEvent,
  threadId: string,
  thread: Thread,
  checkpointId: string,
): Promise<void> {
  const { session } = thread

  const result = await session.navigateTree(checkpointId)
  if (result.cancelled) return

  // The active branch as pi would send it to the model — which is exactly the
  // conversation the user should now see.
  replayInto(emit, threadId, session.sessionManager.buildContextEntries())
}

/** Asks pi to compact. Progress and outcome both arrive as session events, so a
 *  refusal ("nothing to compact") is already reported by the time this rejects —
 *  and it is not a thread failure. */
export async function compactThread(thread: Thread): Promise<void> {
  try {
    await thread.session.compact()
  } catch {
    // Already surfaced by the translator's `compaction_end` handling.
  }
}
