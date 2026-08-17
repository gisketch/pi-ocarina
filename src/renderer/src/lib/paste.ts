/** Folding a large paste into something the composer can still be read around.
 *
 *  A stack trace pasted into a three-line box buries the reader's own question
 *  under text they then have to scroll past to find it. So past a threshold the
 *  paste is replaced by a short token, and the text is held beside it until the
 *  message is sent.
 *
 *  The token is ordinary readable text on purpose. A zero-width sentinel would
 *  be invisible to the caret, to selection and to the reader; this one can be
 *  seen, selected, and deleted like any other word — and deleting it drops the
 *  paste with it, which is the behaviour a person expects without being told. */

/** Either threshold folds. Both, because either alone misses a real case: eight
 *  lines catches a stack trace, four hundred characters catches a single-line
 *  minified blob. */
export const FOLD_LINES = 8
export const FOLD_CHARS = 400

export interface Fold {
  id: number
  /** What the reader actually pasted. */
  text: string
  /** The literal string standing in for it in the composer. */
  token: string
}

export function shouldFold(text: string): boolean {
  if (text.length >= FOLD_CHARS) return true
  return text.split('\n').length >= FOLD_LINES
}

/** What the token says. Lines when there are lines to count, characters when
 *  the paste is one long line — a `1 line` chip would say nothing about why the
 *  composer just folded it. */
export function foldLabel(text: string): string {
  const lines = text.split('\n').length
  if (lines > 1) return `pasted ${lines} lines`
  return `pasted ${text.length} characters`
}

export function makeFold(id: number, text: string): Fold {
  return { id, text, token: `[${foldLabel(text)} #${id}]` }
}

/** The folds whose tokens are still in the text.
 *
 *  Deleting the token is how a reader drops a paste, so the held text has to
 *  follow the token rather than outlive it. Called before sending, and after
 *  every edit that could have removed one. */
export function foldsIn(text: string, folds: readonly Fold[]): Fold[] {
  return folds.filter((fold) => text.includes(fold.token))
}

/** Puts every fold's real text back where its token stands.
 *
 *  Position matters: a paste dropped into the middle of a sentence belongs in
 *  the middle of that sentence when the model reads it, not appended at the
 *  end. */
export function spliceFolds(text: string, folds: readonly Fold[]): string {
  let out = text
  for (const fold of folds) {
    // `split`/`join` rather than `replace`: a token could in principle appear
    // twice if the reader copied it, and `replace` with a string replaces only
    // the first.
    out = out.split(fold.token).join(fold.text)
  }
  return out
}

/** The fold the caret is sitting inside, if any.
 *
 *  What makes a folded paste readable before it is sent: the composer cannot
 *  put a clickable element inside a textarea, but it always knows where the
 *  caret is, and a caret inside the token is the reader asking what is in it. */
export function foldAt(text: string, caret: number, folds: readonly Fold[]): Fold | null {
  for (const fold of folds) {
    let from = 0
    for (;;) {
      const at = text.indexOf(fold.token, from)
      if (at === -1) break
      if (caret >= at && caret <= at + fold.token.length) return fold
      from = at + fold.token.length
    }
  }
  return null
}

/** Inserts a paste at the caret, folded or not.
 *
 *  Returns the new text, where the caret lands, and the fold to hold — null
 *  when the paste was small enough to stay as itself. */
export function applyPaste(
  text: string,
  selection: { start: number; end: number },
  pasted: string,
  nextId: number,
): { text: string; caret: number; fold: Fold | null } {
  const inserted = shouldFold(pasted) ? makeFold(nextId, pasted) : null
  const body = inserted ? inserted.token : pasted

  return {
    text: text.slice(0, selection.start) + body + text.slice(selection.end),
    caret: selection.start + body.length,
    fold: inserted,
  }
}
