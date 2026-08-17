/** Clipboard images, given a place on disk to live.
 *
 *  A screenshot has no path — it is bytes in the clipboard, and drag-drop can
 *  never carry one. The bytes arrive in the renderer inside the paste event, so
 *  the seam still holds: the renderer never *opened* anything. Main writes them
 *  to a temporary directory and hands back a real `AttachmentRef`.
 *
 *  Everything downstream is then unchanged. `readImages` reads by path, the
 *  chip row already knows how to show and remove one, and `open ↗` has a file
 *  to open. One command, no new transport. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AttachmentRef } from '../../shared/vocabulary'

/** Refused rather than guessed at: a file named for a type it is not would be
 *  opened by the wrong application, and pi would be handed a mime it cannot
 *  read. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

export function extensionForMime(mime: string): string | null {
  return EXTENSIONS[mime.split(';')[0].trim().toLowerCase()] ?? null
}

/** Anything past this is not a screenshot; it is a file that wanted dropping.
 *  Base64 inflates by a third, so the real ceiling is stated in bytes. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export class StagedImages {
  /** The promise, not the path.
   *
   *  `#dir ??= await mkdtemp(...)` reads as one step and is two: both of two
   *  images pasted together see null, both create a directory, and the second
   *  assignment orphans the first — a leaked folder nobody would think to look
   *  for. Caching the promise makes the second caller wait for the first. */
  #dir: Promise<string> | null = null
  #count = 0

  /** Writes clipboard bytes to a file and describes it as an attachment. */
  async stage(data: string, mime: string): Promise<AttachmentRef | null> {
    const extension = extensionForMime(mime)
    if (!extension) return null

    let bytes: Buffer
    try {
      bytes = Buffer.from(data, 'base64')
    } catch {
      return null
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null

    this.#dir ??= mkdtemp(join(tmpdir(), 'piocarina-pasted-'))
    const dir = await this.#dir
    this.#count += 1

    const name = `pasted-${this.#count}.${extension}`
    const path = join(dir, name)
    await writeFile(path, bytes)

    return { name, path, mime }
  }

  /** Removes the directory. Called when the app closes: a pasted screenshot is
   *  scratch, and leaving a folder of them behind on every session would be a
   *  slow leak nobody would think to look for. */
  async cleanup(): Promise<void> {
    if (!this.#dir) return
    const pending = this.#dir
    this.#dir = null
    this.#count = 0
    // Awaited before removal: a directory still being created cannot be
    // removed, and cleanup running during a paste is exactly when that happens.
    await pending.then((dir) => rm(dir, { recursive: true, force: true })).catch(() => {})
  }
}
