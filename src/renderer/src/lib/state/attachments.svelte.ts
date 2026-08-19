import type { AttachmentRef } from '../../../../shared/vocabulary'
import { isImageAttachment } from '../../../../shared/vocabulary'
import { bridge } from '../bridge'

/** Files staged for the next prompt.
 *
 *  Only paths are held. The renderer never opens a file — main does, which
 *  keeps the one process with filesystem access the only one that has it. */
class Attachments {
  list = $state.raw<AttachmentRef[]>([])
  /** True while a file is over the window, so the drop zone can show. */
  dragging = $state(false)

  /** Stages dropped files. Returns how many were added, so the caller knows
   *  whether the drop did anything. */
  add(files: readonly File[]): string[] {
    const bridged = bridge
    if (!bridged) return []

    const staged = files
      .map((file): AttachmentRef | null => {
        const path = bridged.files.pathFor(file)
        // A file with no real path came from somewhere the app cannot read —
        // a browser drag, say. Staging it would promise bytes we cannot get.
        return path ? { name: file.name, path, mime: file.type || undefined } : null
      })
      .filter((attachment): attachment is AttachmentRef => attachment !== null)
      .filter((attachment) => !this.list.some((existing) => existing.path === attachment.path))

    if (staged.length > 0) {
      this.list = [...this.list, ...staged]
      // The composer puts these into the sentence. A file is a chip where the
      // reader dropped it, not a row above what they were writing.
      this.pending = [...this.pending, ...staged.map((one) => one.name)]
    }
    return staged.map((one) => one.name)
  }

  /** Names staged from outside the composer — a drop lands on the window, not
   *  in the field — waiting to be written into the text. Drained by the
   *  composer, which is the only thing that knows where the caret is. */
  pending = $state.raw<string[]>([])

  takePending(): string[] {
    if (this.pending.length === 0) return []
    const names = this.pending
    this.pending = []
    return names
  }

  /** Stages a file main already wrote — a pasted screenshot. Its path is real,
   *  so everything downstream treats it exactly like a dropped file. */
  push(attachment: AttachmentRef): void {
    if (this.list.some((existing) => existing.path === attachment.path)) return
    this.list = [...this.list, attachment]
  }

  clear(): void {
    this.list = []
  }

  /** Drops files whose names the reader deleted from the composer.
   *
   *  A chip is the file: deleting the name is how a staged file is unstaged,
   *  the same way deleting a fold's token drops the paste.
   *
   *  Each file claims one *occurrence*, longest name first, and an occurrence
   *  claimed is spent. A plain `includes` got both of these wrong and silently:
   *  `shot.png` stayed staged because `screenshot.png` contains it, and two
   *  files called `notes.md` could never be reduced to one. A file still
   *  travelling with a prompt that shows no chip for it is the worst kind of
   *  wrong, because nothing on screen says so. */
  prune(text: string): void {
    const claimed: { start: number; end: number }[] = []
    const free = (at: number, name: string): boolean =>
      !claimed.some((span) => at < span.end && at + name.length > span.start)

    const kept = [...this.list]
      .sort((a, b) => b.name.length - a.name.length)
      .filter((attachment) => {
        for (let at = text.indexOf(attachment.name); at !== -1; ) {
          if (free(at, attachment.name)) {
            claimed.push({ start: at, end: at + attachment.name.length })
            return true
          }
          at = text.indexOf(attachment.name, at + 1)
        }
        return false
      })

    if (kept.length === this.list.length) return
    // Back into the order they were staged in: the sort above is a detail of
    // the matching, not a change to what the reader attached.
    this.list = this.list.filter((attachment) => kept.includes(attachment))
  }


  /** The names the composer draws as chips. */
  get names(): string[] {
    return this.list.map((attachment) => attachment.name)
  }

  get images(): AttachmentRef[] {
    return this.list.filter(isImageAttachment)
  }
}

export const attachments = new Attachments()
