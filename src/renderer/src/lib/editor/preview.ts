/** A read-only pane that draws a file exactly the way the buffer would
 *  (spec D2, D6): same theme, same palette highlighting, same gutter — just
 *  no editing and no vim. The file search's right pane mounts one per
 *  highlighted file.
 *
 *  Part of the editor seam: CodeMirror's packages stay behind `lib/editor/`,
 *  and components hold only the returned handle. */

import { EditorView, lineNumbers } from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import { syntaxHighlighting } from '@codemirror/language'
import { languageFor } from './language'
import { ocarinaHighlight, ocarinaTheme } from './theme'

export interface PreviewHandle {
  destroy(): void
}

export function mountPreview(host: HTMLElement, text: string, path: string): PreviewHandle {
  const language = new Compartment()

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        syntaxHighlighting(ocarinaHighlight),
        language.of([]),
        ocarinaTheme,
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
      ],
    }),
  })

  void languageFor(path).then((support) => {
    if (support && view.dom.isConnected) {
      view.dispatch({ effects: language.reconfigure(support) })
    }
  })

  return { destroy: () => view.destroy() }
}
