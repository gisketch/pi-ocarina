/** What happens when someone pastes into the composer.
 *
 *  Two kinds of paste, one entry point. Bytes that are an image become a staged
 *  file and a chip. Text that is too long to read around becomes a token, and
 *  its content is held here until the message is sent.
 *
 *  Held here rather than in the component because it is a small state machine
 *  with a real invariant — a fold's text must live exactly as long as its token
 *  — and because the component is already the longest thing in the renderer. */

import { applyPaste, foldAt, foldsIn, spliceFolds, type Fold } from '../paste'
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
   *  them from the event it was handed, so it still opens no files.
   *
   *  Returns the names it staged, so the composer can put them in the text
   *  where the reader pasted. A chip belongs in the sentence, not in a row
   *  above it. */
  async images(files: readonly File[]): Promise<string[]> {
    const pictures = files.filter((file) => file.type.startsWith('image/'))
    if (pictures.length === 0 || !session.wired) return []

    const staged: string[] = []
    for (const picture of pictures) {
      try {
        const bytes = new Uint8Array(await picture.arrayBuffer())
        const { attachment } = await session.invoke('stageImage', {
          data: base64(bytes),
          mime: picture.type,
        })
        if (attachment) {
          attachments.push(attachment)
          staged.push(attachment.name)
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
      const names = await this.images(files)
      // The names land at the caret, so the picture is a chip in the sentence
      // the reader is writing — and the sent message can draw it in the same
      // place, because the name is really there in the text.
      return names.length === 0 ? null : nameAt(text, field, names)
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

  /** Puts the newest fold back as plain text.
   *
   *  The spec promises that undo after a fold restores what was pasted, and
   *  native undo cannot deliver it: the fold is applied by assignment, not by
   *  the browser, so there is nothing in the field's own undo stack to return
   *  to. Returns null when there is no fold to unfold, and the browser's undo
   *  is left alone. */
  undo(text: string): { text: string; caret: number } | null {
    const newest = this.folds[this.folds.length - 1]
    if (!newest) return null

    const at = text.indexOf(newest.token)
    if (at === -1) return null

    this.folds = this.folds.slice(0, -1)
    return {
      text: text.slice(0, at) + newest.text + text.slice(at + newest.token.length),
      caret: at + newest.text.length,
    }
  }

  /** What the caret is standing in, so the composer can show it. */
  at(text: string, caret: number): Fold | null {
    return foldAt(text, caret, this.folds)
  }

  /** Deletes the whole token the caret is standing at the end of.
   *
   *  Backspace inside a chip used to take one character, which broke the token
   *  — so `prune` dropped the paste and left the remaining characters sitting
   *  in the composer as literal text the reader then had to clear by hand. A
   *  chip is one thing; deleting it deletes all of it. */
  backspace(text: string, caret: number): { text: string; caret: number } | null {
    const fold = foldAt(text, caret, this.folds)
    if (!fold) return null

    const at = text.lastIndexOf(fold.token, caret)
    if (at === -1 || caret <= at) return null

    this.folds = this.folds.filter((one) => one !== fold)
    return { text: text.slice(0, at) + text.slice(at + fold.token.length), caret: at }
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

/** Puts staged names into the text at the caret, spaced so they read as
 *  words rather than running into what is already there. */
export function nameAt(
  text: string,
  field: HTMLTextAreaElement | null,
  names: readonly string[],
): { text: string; caret: number } {
  const at = field?.selectionStart ?? text.length
  const end = field?.selectionEnd ?? at

  const before = text.slice(0, at)
  const after = text.slice(end)
  const said = names.join(' ')
  const lead = before === '' || /\s$/.test(before) ? '' : ' '
  // Always one trailing space: the caret lands after it, so the reader keeps
  // typing their sentence rather than running into the name they just
  // inserted. When what follows is already whitespace this would be two, so
  // it is only added when it is not.
  const trail = /^\s/.test(after) ? '' : ' '

  const inserted = `${lead}${said}${trail}`
  return { text: before + inserted + after, caret: at + inserted.length }
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
