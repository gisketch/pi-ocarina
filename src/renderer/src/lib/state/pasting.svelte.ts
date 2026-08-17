/** What happens when someone pastes into the composer.
 *
 *  Two kinds of paste, one entry point. Bytes that are an image become a staged
 *  file and a chip. Text that is too long to read around becomes a token, and
 *  its content is held here until the message is sent.
 *
 *  Held here rather than in the component because it is a small state machine
 *  with a real invariant — a fold's text must live exactly as long as its token
 *  — and because the component is already the longest thing in the renderer. */

import { applyPaste, foldsIn, spliceFolds, type Fold } from '../paste'
import { attachments } from './attachments.svelte'
import { session } from '../session'

class Pasting {
  folds = $state.raw<Fold[]>([])
  #next = 0

  /** Text pasted at the caret, folded when it is large.
   *
   *  Returns what the composer should become, or null when the paste was
   *  ordinary and the browser should just do it — letting the browser handle
   *  the common case keeps native undo working for it. */
  text(current: string, selection: { start: number; end: number }, pasted: string):
    | { text: string; caret: number }
    | null {
    const result = applyPaste(current, selection, pasted, this.#next + 1)
    if (!result.fold) return null

    this.#next += 1
    this.folds = [...this.folds, result.fold]
    return { text: result.text, caret: result.caret }
  }

  /** Stages clipboard images. Main writes the bytes; the renderer only carries
   *  them from the event it was handed, so it still opens no files. */
  async images(files: readonly File[]): Promise<number> {
    const pictures = files.filter((file) => file.type.startsWith('image/'))
    if (pictures.length === 0 || !session.wired) return 0

    let staged = 0
    for (const picture of pictures) {
      try {
        const bytes = new Uint8Array(await picture.arrayBuffer())
        const { attachment } = await session.invoke('stageImage', {
          data: base64(bytes),
          mime: picture.type,
        })
        if (attachment) {
          attachments.push(attachment)
          staged += 1
        }
      } catch {
        // An image that will not stage is dropped rather than failing the
        // paste: the text beside it is still worth having.
      }
    }
    return staged
  }

  /** The whole of a paste event: pictures, a wall of text, or nothing to do.
   *
   *  Returns what the composer should become, or null when the browser should
   *  handle the paste itself — the ordinary case, kept native so that native
   *  undo keeps working for it.
   *
   *  Calls `preventDefault` itself, because whether the default is wanted is
   *  exactly what this decides. */
  async fromEvent(
    event: ClipboardEvent,
    text: string,
    field: HTMLTextAreaElement | null,
  ): Promise<{ text: string; caret: number } | null> {
    const data = event.clipboardData
    if (!data) return null

    const files = [...data.files]
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault()
      await this.images(files)
      return null
    }

    const pasted = data.getData('text/plain')
    if (pasted === '') return null

    const folded = this.text(text, {
      start: field?.selectionStart ?? text.length,
      end: field?.selectionEnd ?? text.length,
    }, pasted)
    if (!folded) return null

    event.preventDefault()
    return folded
  }

  /** Drops folds whose tokens the reader deleted. Called on every edit. */
  prune(text: string): void {
    const kept = foldsIn(text, this.folds)
    if (kept.length !== this.folds.length) this.folds = kept
  }

  /** The message as the model should read it: every token back to its text. */
  expand(text: string): string {
    return spliceFolds(text, this.folds)
  }

  clear(): void {
    this.folds = []
  }
}

/** `btoa` wants a binary string, and a big screenshot would blow the argument
 *  limit if the whole array were spread at once. */
function base64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export const pasting = new Pasting()
