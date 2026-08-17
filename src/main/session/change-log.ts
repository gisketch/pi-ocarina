/** What a thread has done to the files it touched.
 *
 *  A tool call says which file it is about; it does not say what the file looked
 *  like on either side of it. So this reads the file when a call starts and
 *  again when it ends, and the difference between those two reads is the change
 *  that call made.
 *
 *  Reading the file rather than parsing the tool's arguments is deliberate. It
 *  is the only source that carries real line numbers and real context, and the
 *  only one that does not break the day pi renames an argument.
 *
 *  Two records come out of it. Per call, for the row in the ledger: before and
 *  after. Per file, for the viewer: the first before and the latest after, which
 *  is the same question asked over a longer span. */

import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

/** A file larger than this is not snapshotted at all. `diffLines` would refuse
 *  to diff it anyway, and holding two copies of it in memory for the life of a
 *  thread buys nothing. */
const MAX_SNAPSHOT_BYTES = 400_000

export interface CallChange {
  path: string
  before: string
  after: string
  /** False when one side could not be read — too large, or gone. The two
   *  versions are then not comparable, and the caller must say so rather than
   *  diff a real file against an empty string. */
  complete: boolean
}

interface FileHistory {
  /** The file before this thread first touched it. */
  first: string
  /** The file as of the most recent call that touched it. */
  last: string
  /** False once any call on this file could not be read on one side. The whole
   *  span is then untrustworthy: a missing middle means `first` and `last` are
   *  not two versions of the same story. */
  complete: boolean
}

/** Reads a file as text.
 *
 *  Three outcomes, and the difference between the last two is the whole point.
 *  A file that is not there yet reads as empty — that is what makes a `write`
 *  render as all additions without a special case anywhere. A file that is
 *  there but cannot be held reads as null, because calling it empty would
 *  publish a deletion the agent never made: a file grown past the cap by one
 *  line would be reported as every line removed. */
function readText(path: string): string | null {
  let size: number
  try {
    size = statSync(path).size
  } catch {
    // Not there. For a `write` this is the truthful before.
    return ''
  }

  if (size > MAX_SNAPSHOT_BYTES) return null
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export class ChangeLog {
  /** Calls that have started and not yet ended, by tool call id. */
  readonly #open = new Map<string, { path: string; before: string | null }>()
  /** Per thread, per absolute path. */
  readonly #files = new Map<string, Map<string, FileHistory>>()

  /** Snapshots the file a call is about to change.
   *
   *  Synchronous on purpose. The subscription that calls this is synchronous, so
   *  an awaited read would return after pi had already written, and the "before"
   *  would be the "after". */
  start(toolCallId: string, target: string, cwd: string): void {
    const path = isAbsolute(target) ? target : resolve(cwd, target)
    this.#open.set(toolCallId, { path, before: readText(path) })
  }

  /** Closes a call and returns what it did, or null if it was never opened —
   *  a tool kind we do not snapshot, or a call that began before this thread
   *  was adopted. */
  end(threadId: string, toolCallId: string): CallChange | null {
    const opened = this.#open.get(toolCallId)
    if (!opened) return null
    this.#open.delete(toolCallId)

    const after = readText(opened.path)
    const complete = opened.before !== null && after !== null
    this.#remember(threadId, opened.path, opened.before ?? '', after ?? '', complete)
    return { path: opened.path, before: opened.before ?? '', after: after ?? '', complete }
  }

  /** Every file this thread changed, and the span across which it changed it.
   *
   *  A file whose span has a hole in it is left out rather than shown with a
   *  guess in the middle. The ledger's rows still say a call happened. */
  changes(threadId: string): CallChange[] {
    const files = this.#files.get(threadId)
    if (!files) return []

    return [...files.entries()]
      .filter(([, history]) => history.complete && history.first !== history.last)
      .map(([path, history]) => ({
        path,
        before: history.first,
        after: history.last,
        complete: true,
      }))
  }

  /** Drops everything about a thread whose column has gone. */
  forget(threadId: string): void {
    this.#files.delete(threadId)
  }

  #remember(
    threadId: string,
    path: string,
    before: string,
    after: string,
    complete: boolean,
  ): void {
    let files = this.#files.get(threadId)
    if (!files) {
      files = new Map()
      this.#files.set(threadId, files)
    }

    const known = files.get(path)
    // Only the first `before` is kept. The second edit of a file must not
    // become the file's own starting point, or the viewer would forget the
    // first edit ever happened.
    files.set(path, {
      first: known?.first ?? before,
      last: after,
      // One unreadable call poisons the span, not just its own row: what
      // happened in the gap is unknown, so `first` against `last` is no longer
      // an account of anything.
      complete: (known?.complete ?? true) && complete,
    })
  }
}

/** Tool kinds whose calls change a file, and are therefore worth snapshotting.
 *  `bash` can change files too, but it does not say which. */
export const CHANGING_TOOLS: ReadonlySet<string> = new Set(['edit', 'write'])
