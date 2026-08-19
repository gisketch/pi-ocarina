/** Reading and writing single workspace files, for the buffer column.
 *
 *  The renderer never touches the filesystem; these are the handlers behind
 *  `readFile` / `writeFile` / `statFile`. Every path is workspace-relative
 *  and resolved under the workspace root — a path that escapes the root is
 *  refused, whatever spelled it. */

import { readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'

/** The message `:w` shows on a stale write. The editor renders this string
 *  verbatim, so it names the way out. */
export const STALE_WRITE = 'file changed on disk — :w! to overwrite'

/** The file's absolute path, or a refusal for one outside the root. */
export function resolveInside(root: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`not a workspace-relative path: ${path}`)
  const full = resolve(root, path)
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`path escapes the workspace: ${path}`)
  }
  return full
}

export async function readWorkspaceFile(
  root: string,
  path: string,
): Promise<{ text: string; mtimeMs: number } | { missing: true }> {
  const full = resolveInside(root, path)
  try {
    const [text, info] = await Promise.all([readFile(full, 'utf8'), stat(full)])
    return { text, mtimeMs: info.mtimeMs }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { missing: true }
    throw cause
  }
}

export async function statWorkspaceFile(
  root: string,
  path: string,
): Promise<{ mtimeMs: number } | { missing: true }> {
  const full = resolveInside(root, path)
  try {
    return { mtimeMs: (await stat(full)).mtimeMs }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { missing: true }
    throw cause
  }
}

/** Writes, unless the file moved on after the buffer loaded it.
 *
 *  `expectMtimeMs` is what the buffer read; null forces (`:w!`). A file that
 *  no longer exists at all is written rather than refused — vim's own `:w`
 *  recreates a deleted file, and the reader asked for their bytes to land. */
export async function writeWorkspaceFile(
  root: string,
  path: string,
  text: string,
  expectMtimeMs: number | null,
): Promise<{ mtimeMs: number }> {
  const full = resolveInside(root, path)

  if (expectMtimeMs !== null) {
    const now = await stat(full).catch(() => null)
    if (now !== null && now.mtimeMs !== expectMtimeMs) throw new Error(STALE_WRITE)
  }

  await writeFile(full, text, 'utf8')
  return { mtimeMs: (await stat(full)).mtimeMs }
}
