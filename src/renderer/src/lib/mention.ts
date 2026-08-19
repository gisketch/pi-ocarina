/** The `@`-mention the caret is currently inside, if any. */
export interface Mention {
  /** Index of the `@` in the text. */
  start: number
  /** Index just past the mention. */
  end: number
  /** What has been typed after the `@`. */
  query: string
}

/** Finds the mention under the caret.
 *
 *  A mention starts at an `@` that follows whitespace or the very start of the
 *  message — otherwise an email address would open a file picker. It ends at
 *  the next space, because a path has no spaces in it and prose after one is
 *  not part of the reference. */
export function mentionAt(text: string, caret: number): Mention | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null

  const preceding = at === 0 ? '' : text[at - 1]
  if (preceding !== '' && !/\s/.test(preceding)) return null

  const query = before.slice(at + 1)
  if (/\s/.test(query)) return null

  return { start: at, end: caret, query }
}

/** Replaces the mention with the chosen path, leaving the caret after it.
 *
 *  Exactly `@path`, no trailing space: the spacing around a chip is the
 *  reader's to type. The picker not reopening on what was just inserted is
 *  the menu's own job (`completions` remembers the completed token). */
export function applyMention(text: string, mention: Mention, path: string): {
  text: string
  caret: number
} {
  const inserted = `@${path}`
  return {
    text: text.slice(0, mention.start) + inserted + text.slice(mention.end),
    caret: mention.start + inserted.length,
  }
}

/** Every path mentioned in a message.
 *
 *  pi 0.84's `prompt()` takes text and images — there is no channel for
 *  attaching a text file. So a mention *is* the path in the message: pi reads
 *  it with its own read tool. This function exists for the app to know what was
 *  referenced, not to send it anywhere else. */
export function mentionedPaths(text: string): string[] {
  const found = text.match(/(?:^|\s)@([^\s]+)/g) ?? []
  return [...new Set(found.map((match) => match.trim().slice(1)))]
}
