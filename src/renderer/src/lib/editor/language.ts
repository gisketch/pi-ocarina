/** Which grammar a path gets, loaded lazily (spec D2).
 *
 *  Shared by the buffer editor and the file-search preview, so the two can
 *  never disagree about what a `.ts` looks like. */

import type { Extension } from '@codemirror/state'
import { languages } from '@codemirror/language-data'

/** The language extension for a path; nothing for a file no grammar claims. */
export async function languageFor(path: string): Promise<Extension | null> {
  const found = languages.find((description) =>
    description.extensions.some((ext) => path.endsWith(`.${ext}`)),
  )
  if (!found) return null
  return found.load()
}
