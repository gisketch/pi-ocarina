/** What a file-changing call shows in its row.
 *
 *  Split from the translator because it answers a different question. The
 *  translator turns pi's events into the app's vocabulary; this turns two
 *  snapshots of a file into the one thing the reader looks at. */

import type { ToolBody } from '../../shared/vocabulary'
import type { CallChange } from './change-log'
import { countChanges, diffLines } from './file-diff'

/** The diff of one call, and the row summary that goes with it.
 *
 *  Computed once. Twice was two chances to disagree about the same call, and
 *  the counts are read off the very lines the reader is shown. */
export function diffOf(change: CallChange): { body?: ToolBody; meta?: string } {
  // One side could not be read — too large, or gone. Diffing a real file
  // against an empty string would publish a deletion nobody made.
  if (!change.complete) {
    return {
      body: { type: 'diff', lines: [{ sign: '@', text: 'too large to show the change' }] },
      meta: 'not shown',
    }
  }

  const lines = diffLines(change.before, change.after, { path: change.path })
  // A call that changed nothing — an edit that replaced text with itself — has
  // nothing to show, and an empty panel says less than no panel.
  if (lines.length === 0) return {}

  const { added, removed } = countChanges(lines)
  const meta =
    added === 0 && removed === 0
      ? undefined
      : change.before === ''
        ? `+${added} new file`
        : removed === 0
          ? `+${added}`
          : `+${added} −${removed}`

  return { body: { type: 'diff', lines }, meta }
}
