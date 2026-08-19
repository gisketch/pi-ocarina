/** The one seam between the app and CodeMirror (spec D2).
 *
 *  Everything CodeMirror lives behind `mountEditor`; components hold the
 *  returned handle and never import the editor's packages. When a piece of
 *  CodeMirror stops fitting, this file is where the replacement lands.
 *
 *  The vim plugin's `Vim` object is global, so the ex commands are registered
 *  once and route back to the mounted editor through a per-instance bag map —
 *  two buffer columns must not answer each other's `:w`. */

import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { Vim, getCM, vim, type CodeMirror } from '@replit/codemirror-vim'
import { EX_COMMANDS, isForced, type ExBag } from './ex-commands'
import { ocarinaTheme } from './theme'

export interface EditorOptions {
  text: string
  /** Workspace-relative path; picks the language by its extension. */
  path: string
  bag: ExBag
  /** vim's own mode word: `normal`, `insert`, `visual`, `replace`. */
  onModeChange?: (mode: string) => void
  onDirtyChange?: (dirty: boolean) => void
}

export interface EditorHandle {
  text(): string
  /** Replaces the document — the watcher's reload. The cursor stays on its
   *  line, best effort (spec D7). */
  setText(text: string): void
  /** The buffer was written; edits from here are what dirty means. */
  markClean(): void
  isDirty(): boolean
  focus(): void
  /** The strip takes the keyboard back; vim keeps whatever mode it was in. */
  blur(): void
  enterNormal(): void
  enterInsert(): void
  /** A one-line message on vim's own notice line, for `:w` refusals. */
  notify(message: string): void
  /** Puts the cursor on a 1-based line and scrolls it into the middle —
   *  how a `path:12` chip lands where it pointed. */
  revealLine(line: number): void
  destroy(): void
}

/** Which mounted editor an ex command belongs to, keyed by the vim adapter
 *  the handler is called with. */
const bags = new WeakMap<CodeMirror, ExBag>()

let registered = false
function registerExCommands(): void {
  if (registered) return
  registered = true

  for (const command of EX_COMMANDS) {
    Vim.defineEx(command.name, command.prefix, (cm, params) => {
      const bag = bags.get(cm as CodeMirror)
      if (!bag) return
      void command.run(bag, isForced(params.argString))
    })
  }
}

/** The language extension for a path, loaded lazily; nothing for a file no
 *  grammar claims. */
async function languageFor(path: string): Promise<Extension | null> {
  const found = languages.find((description) => description.extensions.some((ext) => path.endsWith(`.${ext}`)))
  if (!found) return null
  const support = await found.load()
  return support
}

export function mountEditor(host: HTMLElement, options: EditorOptions): EditorHandle {
  registerExCommands()

  let dirty = false
  const setDirty = (now: boolean): void => {
    if (now === dirty) return
    dirty = now
    options.onDirtyChange?.(now)
  }

  // The grammar loads lazily, so it lives in a compartment the load can
  // reconfigure; plain text in the meantime is correct, only unpainted.
  const language = new Compartment()

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        // vim first: it must see keys before the default keymap does.
        vim({ status: true }),
        lineNumbers(),
        history(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        language.of([]),
        ocarinaTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setDirty(true)
        }),
      ],
    }),
  })

  const cm = getCM(view)
  if (cm) {
    bags.set(cm, options.bag)
    cm.on('vim-mode-change', (change: unknown) => {
      const mode = (change as { mode?: string })?.mode
      if (mode) options.onModeChange?.(mode)
    })
  }

  void languageFor(options.path).then((support) => {
    if (support && view.dom.isConnected) {
      view.dispatch({ effects: language.reconfigure(support) })
    }
  })

  return {
    text: () => view.state.doc.toString(),
    setText: (text) => {
      const line = view.state.doc.lineAt(view.state.selection.main.head).number
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      const target = view.state.doc.line(Math.min(line, view.state.doc.lines))
      view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true })
      setDirty(false)
    },
    markClean: () => setDirty(false),
    isDirty: () => dirty,
    focus: () => view.focus(),
    blur: () => view.contentDOM.blur(),
    enterNormal: () => {
      const adapter = getCM(view)
      if (adapter) Vim.exitInsertMode(adapter as never)
      view.focus()
    },
    enterInsert: () => {
      const adapter = getCM(view)
      if (adapter) Vim.handleKey(adapter as never, 'i', 'user')
      view.focus()
    },
    notify: (message) => {
      const adapter = getCM(view)
      ;(adapter as unknown as { openNotification?: (html: Node) => void })?.openNotification?.(
        document.createTextNode(message),
      )
    },
    revealLine: (line) => {
      const target = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)))
      view.dispatch({
        selection: { anchor: target.from },
        effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
      })
    },
    destroy: () => {
      const adapter = getCM(view)
      if (adapter) bags.delete(adapter)
      view.destroy()
    },
  }
}
