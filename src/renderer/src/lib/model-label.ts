/** What a thread's model is called on screen.
 *
 *  One function, because two places name it now: the title bar, for the thread
 *  with the keyboard, and every column header, so a strip running three models
 *  says which is which. Two spellings of the same fact would drift the first
 *  time a model gained something worth saying.
 *
 *  The reasoning level rides with the name — the two are one choice, and the
 *  only other place the level could be read is inside the picker that changes
 *  it. A model that cannot reason says nothing rather than `off`, which would
 *  read as a setting the reader turned off. */

import type { ReasoningLevel } from '../../../shared/vocabulary'

export interface NamedModel {
  name: string
  reasoning?: ReasoningLevel
}

/** What a thread with no model of its own is running: pi's own choice, which
 *  is an answer rather than a gap. */
export const PI_DEFAULT = 'pi default'

export function modelLabel(model: NamedModel | undefined): string {
  if (!model) return PI_DEFAULT
  return model.reasoning && model.reasoning !== 'off'
    ? `${model.name} · ${model.reasoning}`
    : model.name
}

/** The same name with the vendor prefix dropped, for somewhere narrow.
 *
 *  `anthropic/claude-sonnet-4` in a column header spends the whole width on
 *  the half a reader already knows. */
export function shortModelLabel(model: NamedModel | undefined): string {
  const full = modelLabel(model)
  const at = full.indexOf('/')
  return at === -1 ? full : full.slice(at + 1)
}
