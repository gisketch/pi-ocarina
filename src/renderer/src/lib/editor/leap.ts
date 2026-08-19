/** Leap for the buffer: `s` forward, `S` backward, two characters, a label.
 *
 *  The same shape leap.nvim has. From vim NORMAL, `s` (or `S`) takes the next
 *  two keys as a search over the visible text on that side of the cursor;
 *  every match gets a label; the label's key is the jump. One match jumps
 *  without asking. Escape — or any key no label owns — cancels. The trade is
 *  leap.nvim's own: `s`/`S` stop meaning substitute.
 *
 *  Keys are taken at the highest precedence, before vim sees them, and only
 *  while vim is in plain NORMAL with nothing pending — a leap must never eat
 *  the `s` of `ds` or a count's digits. */

import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { getCM } from '@replit/codemirror-vim'
import { findLeapTargets, LEAP_LABELS } from './leap-core'

class LabelWidget extends WidgetType {
  constructor(readonly label: string) {
    super()
  }
  override eq(other: LabelWidget): boolean {
    return other.label === this.label
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-leap-label'
    span.textContent = this.label
    return span
  }
  override ignoreEvent(): boolean {
    return true
  }
}

const setLabels = StateEffect.define<number[] | null>()

/** An external way in: `s` from the strip enters the buffer already leaping.
 *  The effect reaches the closure below through its update listener. */
const leapBegin = StateEffect.define<{ forward: boolean }>()

export function beginLeap(view: EditorView, forward = true): void {
  view.dispatch({ effects: leapBegin.of({ forward }) })
}

const labelField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const effect of tr.effects) {
      if (!effect.is(setLabels)) continue
      if (effect.value === null) return Decoration.none
      const marks = effect.value.flatMap((pos, i) => [
        Decoration.mark({ class: 'cm-leap-hit' }).range(pos, pos + 2),
        Decoration.widget({ widget: new LabelWidget(LEAP_LABELS[i]), side: 1 }).range(pos + 2),
      ])
      return Decoration.set(marks, true)
    }
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

const leapTheme = EditorView.baseTheme({
  '.cm-leap-hit': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--fg-bright)',
  },
  '.cm-leap-label': {
    backgroundColor: 'var(--accent)',
    color: 'var(--bg-panel, #101014)',
    padding: '0 2px',
    marginLeft: '1px',
    fontWeight: 'bold',
  },
})

/** Vim in plain NORMAL, nothing pending: the only ground a leap starts from. */
function vimIdle(view: EditorView): boolean {
  const cm = getCM(view)
  const vim = (
    cm?.state as {
      vim?: {
        insertMode?: boolean
        visualMode?: boolean
        expectLiteralNext?: boolean
        inputState?: {
          operator?: string | null
          keyBuffer: string[]
          prefixRepeat: string[]
          motionRepeat: string[]
        }
      }
    }
  )?.vim
  if (!vim || vim.insertMode || vim.visualMode || vim.expectLiteralNext) return false
  const input = vim.inputState
  if (!input) return true
  return (
    !input.operator &&
    input.keyBuffer.length === 0 &&
    input.prefixRepeat.length === 0 &&
    input.motionRepeat.length === 0
  )
}

interface Session {
  forward: boolean
  chars: string
  targets: number[]
}

/** One leap per editor: the session lives in this closure, the decorations in
 *  the state field. */
export function leapExtension(): Extension {
  let session: Session | null = null

  const clear = (view: EditorView): void => {
    session = null
    view.dispatch({ effects: setLabels.of(null) })
  }

  const jump = (view: EditorView, pos: number): void => {
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
  }

  /** The visible text on the leap's side of the cursor. The viewport, not the
   *  document: a leap is aimed by eye, and the eye only has the screen. */
  const collect = (view: EditorView, forward: boolean, search: string): number[] => {
    const cursor = view.state.selection.main.head
    const from = forward ? Math.min(cursor + 1, view.viewport.to) : view.viewport.from
    const to = forward ? view.viewport.to : Math.max(cursor, view.viewport.from)
    return findLeapTargets(view.state.sliceDoc(from, to), from, cursor, search)
  }

  const keydown = (event: KeyboardEvent, view: EditorView): boolean => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      if (session) clear(view)
      return false
    }

    if (session === null) {
      if ((event.key !== 's' && event.key !== 'S') || !vimIdle(view)) return false
      session = { forward: event.key === 's', chars: '', targets: [] }
      event.preventDefault()
      event.stopPropagation()
      return true
    }

    // The whole key is the leap's — stopped from bubbling to the shell,
    // whose window handler would read a mid-leap Escape as "leave the
    // buffer" instead of "cancel the leap".
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape' || event.key.length !== 1) {
      clear(view)
      return true
    }

    if (session.chars.length < 2) {
      session.chars += event.key
      if (session.chars.length < 2) return true

      const targets = collect(view, session.forward, session.chars)
      if (targets.length === 0) {
        clear(view)
        return true
      }
      if (targets.length === 1) {
        jump(view, targets[0])
        clear(view)
        return true
      }
      session.targets = targets
      view.dispatch({ effects: setLabels.of(targets) })
      return true
    }

    const target = session.targets[LEAP_LABELS.indexOf(event.key)]
    clear(view)
    if (target !== undefined) jump(view, target)
    return true
  }

  return [
    labelField,
    leapTheme,
    // The strip's way in (`beginLeap`): the effect lands here because the
    // session is closure state the effect cannot reach on its own.
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(leapBegin)) {
            session = { forward: effect.value.forward, chars: '', targets: [] }
          }
        }
      }
    }),
    Prec.highest(
      EditorView.domEventHandlers({
        keydown,
        // Focus leaving mid-leap — Escape to the strip, a click elsewhere —
        // must not strand labels over a buffer nobody is aiming in.
        blur: (_event, view) => {
          if (session) clear(view)
          return false
        },
      }),
    ),
  ]
}
