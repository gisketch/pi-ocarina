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
import { bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { Vim, getCM, vim, type CodeMirror } from '@replit/codemirror-vim'
import { EX_COMMANDS, isForced, type ExBag } from './ex-commands'
import { leapExtension } from './leap'
import { ocarinaHighlight, ocarinaTheme } from './theme'

export interface EditorOptions {
  text: string
  /** Workspace-relative path; picks the language by its extension. */
  path: string
  bag: ExBag
  /** vim's own mode word: `normal`, `insert`, `visual`, `replace`. */
  onModeChange?: (mode: string) => void
  onDirtyChange?: (dirty: boolean) => void
  /** Gutter counts from the cursor, vim's relativenumber. Off by default;
   *  the buffer settings screen flips it through `setRelativeNumbers`. */
  relativeNumbers?: boolean
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
  /** Relative numbering on or off, live — the settings toggle. */
  setRelativeNumbers(on: boolean): void
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

  // The gutter lives in a compartment too: relative numbers depend on the
  // cursor line, and reconfiguring is the only lever that makes CodeMirror
  // re-ask formatNumber for lines it has already drawn. The cursor's own
  // line stays absolute, the way vim's number+relativenumber hybrid reads.
  let relative = options.relativeNumbers ?? false
  const numbers = new Compartment()
  const numberGutter = (): Extension =>
    lineNumbers({
      formatNumber: (lineNo, state) => {
        if (!relative) return String(lineNo)
        const cursor = state.doc.lineAt(state.selection.main.head).number
        return lineNo === cursor ? String(lineNo) : String(Math.abs(lineNo - cursor))
      },
    })
  const renumber = (): void => {
    view.dispatch({ effects: numbers.reconfigure(numberGutter()) })
  }

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        // vim first: it must see keys before the default keymap does. No
        // persistent status panel — the app's own status bar is the buffer's
        // status bar; the plugin still raises a transient panel for `:`, `/`
        // and notifications.
        vim({ status: false }),
        // Above vim inside its own precedence: leap must read `s` first.
        leapExtension(),
        numbers.of(numberGutter()),
        history(),
        bracketMatching(),
        syntaxHighlighting(ocarinaHighlight),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        language.of([]),
        ocarinaTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setDirty(true)
          // Deferred: a dispatch inside an update is an error by contract.
          if (update.selectionSet && relative) {
            queueMicrotask(() => {
              if (update.view.dom.isConnected) renumber()
            })
          }
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
      // Only when vim is not already inserting: a click can leave the engine
      // mid-insert, and handing it another `i` would type a literal one.
      const inserting = (adapter?.state as { vim?: { insertMode?: boolean } })?.vim?.insertMode
      if (adapter && !inserting) Vim.handleKey(adapter as never, 'i', 'user')
      view.focus()
    },
    notify: (message) => {
      const adapter = getCM(view)
      ;(adapter as unknown as { openNotification?: (html: Node) => void })?.openNotification?.(
        document.createTextNode(message),
      )
    },
    setRelativeNumbers: (on) => {
      if (on === relative) return
      relative = on
      renumber()
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
