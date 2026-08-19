/** The buffer column's look, from the app's own variables (spec D2).
 *
 *  CodeMirror paints through this extension and nothing else — no bundled
 *  theme, so the buffer cannot drift off-palette when the accent moves. */

import { EditorView } from '@codemirror/view'

export const ocarinaTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '11.5px',
      backgroundColor: 'transparent',
      color: 'var(--fg-dim)',
    },
    '.cm-content': {
      fontFamily: 'var(--font-body)',
      caretColor: 'var(--accent)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-fat-cursor': {
      background: 'var(--accent)',
      color: 'var(--bg-panel, #101014)',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
      outline: '1px solid var(--accent)',
      background: 'transparent',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--seg-strong)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--fg-ghost)',
      border: 'none',
      fontFamily: 'var(--font-body)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--fg-dim)',
    },
    // The vim `:` line and search prompt, drawn by the plugin.
    '.cm-vim-panel': {
      backgroundColor: 'var(--bg-header)',
      color: 'var(--fg-bright)',
      fontFamily: 'var(--font-body)',
      fontSize: '11.5px',
      padding: '2px 8px',
    },
    '.cm-vim-panel input': {
      color: 'var(--fg-bright)',
      fontFamily: 'var(--font-body)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg-header)',
      color: 'var(--fg-dim)',
      border: 'none',
    },
  },
  { dark: true },
)
