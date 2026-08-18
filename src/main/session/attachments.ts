import { readFile } from 'node:fs/promises'
import type { AttachmentRef } from '../../shared/vocabulary'
import { isImageAttachment } from '../../shared/vocabulary'

/** What pi's `prompt()` accepts alongside the text. */
export interface PromptImage {
  type: 'image'
  data: string
  mimeType: string
}

/** Images pi should see, read from disk.
 *
 *  Only main touches the filesystem: the renderer hands over a path the user
 *  chose by dropping a file, and never opens it. A file that cannot be read is
 *  dropped from the list rather than failing the whole prompt — losing a turn
 *  over one unreadable image would be worse than sending the rest. */
export async function readImages(attachments: readonly AttachmentRef[]): Promise<PromptImage[]> {
  const images = attachments.filter(isImageAttachment)

  const read = await Promise.all(
    images.map(async (attachment): Promise<PromptImage | null> => {
      try {
        const bytes = await readFile(attachment.path)
        return {
          type: 'image',
          data: bytes.toString('base64'),
          mimeType: attachment.mime ?? 'image/png',
        }
      } catch {
        return null
      }
    }),
  )

  return read.filter((image): image is PromptImage => image !== null)
}

/** The line appended to a prompt for files pi cannot take as attachments.
 *
 *  pi 0.84 accepts text and images only, so a log or a patch can only be named
 *  for pi to open with its read tool. Saying so in the message is honest; a
 *  silent drop would leave the user thinking the file went with it. */
export function describeAttachments(attachments: readonly AttachmentRef[]): string {
  const images = attachments.filter(isImageAttachment)
  const others = attachments.filter((attachment) => !isImageAttachment(attachment))
  if (images.length === 0 && others.length === 0) return ''

  const parts: string[] = []

  // Images travel as bytes, which carry no filename — so the model was shown a
  // picture it could not refer to, and the sent message, which is only this
  // text, showed nothing at all of what the reader attached.
  if (images.length > 0) {
    parts.push(`Images attached: ${images.map((attachment) => attachment.name).join(', ')}`)
  }
  if (others.length > 0) {
    parts.push(
      `Attached files (read them if relevant):\n${others.map((attachment) => attachment.path).join('\n')}`,
    )
  }

  return `\n\n${parts.join('\n\n')}`
}

/** The reader's own words, and the files the prompt named after them.
 *
 *  The inverse of `describeAttachments`, and it has to exist: pi stores the
 *  whole prompt, so a replayed thread would otherwise draw the description as
 *  a paragraph the reader never typed — the separate row this spec exists to
 *  remove. Live and replay split it the same way, so a message reads the same
 *  both times.
 *
 *  Paths are not recovered as paths. A replayed chip names the file; whether
 *  that file is still there is not something a session log can promise. */
export function splitAttachments(prompt: string): { text: string; names: string[] } {
  const at = prompt.search(/\n\n(Images attached: |Attached files \(read them if relevant\):\n)/)
  if (at === -1) return { text: prompt, names: [] }

  const names: string[] = []
  for (const part of prompt.slice(at).trim().split('\n\n')) {
    if (part.startsWith('Images attached: ')) {
      names.push(...part.slice('Images attached: '.length).split(', '))
      continue
    }
    if (part.startsWith('Attached files (read them if relevant):\n')) {
      for (const line of part.split('\n').slice(1)) {
        const name = line.slice(line.lastIndexOf('/') + 1)
        if (name !== '') names.push(name)
      }
    }
  }

  return { text: prompt.slice(0, at), names: names.filter((name) => name !== '') }
}
