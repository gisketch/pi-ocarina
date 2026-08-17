/** Every file a thread changed, as one diff each.
 *
 *  The same `diffLines` the ledger's rows go through, given a longer span: the
 *  file before the thread's first edit against the file after its last. A
 *  second differ anywhere is how the two views would come to disagree. */

import { isAbsolute, relative } from 'node:path'
import type { ChangedFile } from '../../shared/protocol'
import type { CallChange } from './change-log'
import { countChanges, diffLines } from './file-diff'

export function changedFiles(changes: CallChange[], cwd: string | undefined): ChangedFile[] {
  return changes.map((change) => {
    const lines = diffLines(change.before, change.after, { path: change.path })
    const { added, removed } = countChanges(lines)
    return {
      path: shorten(change.path, cwd),
      added,
      removed,
      existed: change.before !== '',
      lines,
    }
  })
}

/** A path as the reader knows it: relative to the tree it is in.
 *
 *  `relative`, not a string prefix. `/repo-notes/a.ts` starts with `/repo`, and
 *  slicing by length would call it `otes/a.ts` — a path that looks like it is
 *  inside the workspace and is not. */
function shorten(path: string, cwd: string | undefined): string {
  if (cwd === undefined) return path

  const inside = relative(cwd, path)
  return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? path : inside
}
