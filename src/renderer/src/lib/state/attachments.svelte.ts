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
  add(files: readonly File[]): number {
    const bridged = bridge
    if (!bridged) return 0

    const staged = files
      .map((file): AttachmentRef | null => {
        const path = bridged.files.pathFor(file)
        // A file with no real path came from somewhere the app cannot read —
        // a browser drag, say. Staging it would promise bytes we cannot get.
        return path ? { name: file.name, path, mime: file.type || undefined } : null
      })
      .filter((attachment): attachment is AttachmentRef => attachment !== null)
      .filter((attachment) => !this.list.some((existing) => existing.path === attachment.path))

    if (staged.length > 0) this.list = [...this.list, ...staged]
    return staged.length
  }

  remove(path: string): void {
    this.list = this.list.filter((attachment) => attachment.path !== path)
  }

  clear(): void {
    this.list = []
  }

  get images(): AttachmentRef[] {
    return this.list.filter(isImageAttachment)
  }
}

export const attachments = new Attachments()
