/** Text-shaped paint for Vim's linewise visual mode.
 *
 * `V` selects rows, but Vim paints only the characters that exist on each
 * row. Separate marks keep the empty canvas after each line untouched and let
 * the moving/head row carry a stronger treatment without stacking colours. */

import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

interface VisualLineState {
  active: boolean
  decorations: DecorationSet
}

const setVisualLine = StateEffect.define<boolean>()
const OFF: VisualLineState = { active: false, decorations: Decoration.none }

function rows(state: EditorState): DecorationSet {
  const selection = state.selection.main
  const first = state.doc.lineAt(selection.from)
  // A range ending at the next line's start has not selected that next row.
  const lastPosition = Math.max(selection.from, selection.to - Number(selection.to > selection.from))
  const last = state.doc.lineAt(lastPosition)
  const headPosition =
    selection.head > selection.anchor
      ? Math.max(selection.from, selection.head - 1)
      : selection.head
  const current = state.doc.lineAt(headPosition).number
  const marks = []

  for (let number = first.number; number <= last.number; number += 1) {
    const line = state.doc.line(number)
    if (line.from === line.to) continue
    const currentClass = number === current ? ' cm-visual-line-current' : ''
    marks.push(
      Decoration.mark({ class: `cm-visual-line-text${currentClass}` }).range(line.from, line.to),
    )
  }

  return Decoration.set(marks)
}

const visualLineField = StateField.define<VisualLineState>({
  create: () => OFF,
  update(value, transaction) {
    let active = value.active
    let changed = transaction.docChanged || transaction.selection !== undefined

    for (const effect of transaction.effects) {
      if (!effect.is(setVisualLine)) continue
      active = effect.value
      changed = true
    }

    if (!active) return value.active ? OFF : value
    return changed ? { active, decorations: rows(transaction.state) } : value
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.editorAttributes.from(field, (value) => {
      const attributes: Record<string, string> = {}
      if (value.active) attributes.class = 'cm-visual-line-mode'
      return attributes
    }),
  ],
})

export const visualLineExtension = visualLineField

export function showVisualLines(view: EditorView, active: boolean): void {
  view.dispatch({ effects: setVisualLine.of(active) })
}
