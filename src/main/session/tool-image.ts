/** A picture the agent looked at, drawn as a picture.
 *
 *  Before this, a `read` of a `.png` produced a text row for a thing that is an
 *  image: the reader watched the agent look at something they could not see.
 *
 *  Detection is by extension, and only for a call that succeeded. Sniffing the
 *  bytes would be more thorough and would also mean opening every file a read
 *  touched; a failed read gets nothing, because inventing an image for a call
 *  that did not happen is worse than a plain row. */

import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { ToolBody } from '../../shared/vocabulary'
import { imageSize } from './image-size'

const MIMES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

/** Past this the row states the size instead of drawing the picture. A data URI
 *  is a string in the renderer's heap and in every list that holds the block;
 *  a five megabyte texture inside a virtualized column is a stall, not a
 *  preview. */
export const MAX_DRAWN_BYTES = 2 * 1024 * 1024

export function imageMime(path: string): string | null {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? null : (MIMES[path.slice(dot).toLowerCase()] ?? null)
}

const kb = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`

/** A file as a data URI, when it is an image small enough to draw.
 *
 *  The renderer cannot show `file://` — the app's CSP is `img-src 'self'
 *  data:`, which is what keeps a message from reaching the disk by writing an
 *  `<img>` tag — so a picture the reader staged has to arrive as bytes like
 *  every other one.
 *
 *  No containment check here: the caller decides whose path this is. A tool
 *  result's path is the model's and is checked against the workspace; an
 *  attachment's path is one this app staged or the reader chose in a dialog. */
export async function readImageUri(path: string): Promise<string | null> {
  const mime = imageMime(path)
  if (!mime) return null

  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_DRAWN_BYTES) return null
    const bytes = await readFile(path)
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

/** The body for a `read` of an image, or null when it was not one. */
export async function imageBody(
  toolName: string,
  args: unknown,
  cwd: string,
  isError: boolean,
  /** Paths outside the workspace this app vouches for — the directory it
   *  staged pasted screenshots into. Not a general exception: the caller names
   *  one directory it created, and everything else is still refused. */
  ours: (path: string) => boolean = () => false,
): Promise<ToolBody | null> {
  if (toolName !== 'read' || isError) return null

  const raw = (args as { path?: unknown })?.path
  const path = typeof raw === 'string' ? raw : ''
  if (path === '') return null

  const mime = imageMime(path)
  if (!mime) return null

  // `resolve` on both branches: an absolute path taken as written keeps its
  // `..` segments, so `/w/repo/../secret.png` passed a prefix test against
  // `/w/repo` and was read and inlined. Normalising first is the whole check.
  const full = resolve(isAbsolute(path) ? path : join(cwd, path))
  const root = resolve(cwd)
  // Outside the workspace is not this app's to open, whatever the model asked
  // the read tool for. The separator matters: `/w/repo-secrets` must not pass
  // a prefix test against `/w/repo`.
  if (full !== root && !full.startsWith(`${root}/`) && !ours(full)) return null

  try {
    const info = await stat(full)
    if (!info.isFile()) return null
    if (info.size > MAX_DRAWN_BYTES) {
      return { type: 'markdown', text: `*${path} — ${kb(info.size)}, too large to draw here*` }
    }

    const bytes = await readFile(full)
    const size = imageSize(bytes)
    return {
      type: 'image',
      src: `data:${mime};base64,${bytes.toString('base64')}`,
      alt: path,
      ...(size ? { caption: `${size.width}×${size.height}` } : {}),
    }
  } catch {
    // The read succeeded and this did not, which says the file moved or is not
    // ours to open. A plain row is the honest outcome.
    return null
  }
}
