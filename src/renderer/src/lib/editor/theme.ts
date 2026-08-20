/** The buffer column's look, from the app's own variables (spec D2).
 *
 *  CodeMirror paints through this extension and nothing else — no bundled
 *  theme. Its surface stays transparent so it is visibly part of the column;
 *  the workspace accent and its rotations supply the syntax hierarchy. */

import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const ocarinaTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '11.5px',
      backgroundColor: 'transparent',
      color: 'var(--fg)',
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
    // OCARINA has the keyboard, so the buffer draws no cursor at all — a
    // ghost outline reads as "keys go here", which is exactly the lie.
    // `display` because the plugin styles its outline at highest precedence;
    // it never sets display, so this wins without a fight.
    '&:not(.cm-focused) .cm-fat-cursor': {
      display: 'none',
    },
    // Characterwise visual mode uses CodeMirror's native range. Linewise mode
    // suppresses that range and supplies one text-only mark per selected row,
    // preventing any paint over the empty canvas after an end-of-line.
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 24%, var(--bg-column))',
    },
    // CodeMirror's linewise range includes each newline. Its selection layer
    // turns that into a full-width rectangle, so hide the layer completely
    // while our character-only marks are active. Native selection is also
    // forced clear so the app-wide green ::selection colour cannot leak in.
    '&.cm-visual-line-mode .cm-selectionLayer': {
      display: 'none',
    },
    '&.cm-visual-line-mode .cm-line::selection, &.cm-visual-line-mode .cm-line *::selection': {
      backgroundColor: 'transparent !important',
    },
    '.cm-visual-line-text': {
      // Mix onto the opaque column ground before painting. A translucent mark
      // gets brighter wherever another decoration or seam shadow crosses it;
      // this colour is idempotent no matter how many times that pixel paints.
      backgroundColor: 'color-mix(in srgb, var(--accent) 22%, var(--bg-column))',
      boxShadow:
        '0 -1px 0 color-mix(in srgb, var(--accent) 22%, var(--bg-column)), 0 1px 0 color-mix(in srgb, var(--accent) 22%, var(--bg-column))',
    },
    '.cm-visual-line-current': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 34%, var(--bg-column))',
      boxShadow:
        '0 -1px 0 color-mix(in srgb, var(--accent) 34%, var(--bg-column)), 0 1px 0 color-mix(in srgb, var(--accent) 34%, var(--bg-column))',
      fontWeight: '600',
      filter: 'brightness(1.16)',
    },
    // Current-line emphasis is typographic, so it also stops at the text.
    // There is deliberately no full-width active-line background.
    '.cm-activeLine': {
      backgroundColor: 'transparent',
      color: 'var(--fg-bright)',
      fontWeight: '600',
      filter: 'brightness(1.1)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--fg-ghost)',
      border: 'none',
      fontFamily: 'var(--font-body)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--fg-bright)',
      fontWeight: '700',
      filter: 'brightness(1.16)',
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

/** Workspace colour leads the grammar. Its two rotated tones separate values,
 *  calls and types without importing a second palette into the column. */
export const ocarinaHighlight = HighlightStyle.define(
  [
    { tag: [tags.keyword, tags.moduleKeyword, tags.controlKeyword], color: 'var(--accent)', fontWeight: '500' },
    { tag: [tags.operator, tags.operatorKeyword, tags.definitionKeyword], color: 'color-mix(in srgb, var(--accent) 72%, var(--fg-dim))' },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--tone-2)' },
    { tag: [tags.number, tags.bool, tags.atom, tags.null, tags.escape], color: 'var(--tone-3)' },
    { tag: [tags.comment, tags.docComment], color: 'var(--fg-dimmest)', fontStyle: 'italic' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--tone-2)', fontWeight: '500' },
    { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--tone-3)' },
    { tag: [tags.propertyName, tags.attributeName, tags.labelName], color: 'var(--fg-body)' },
    { tag: [tags.variableName, tags.definition(tags.variableName)], color: 'var(--fg)' },
    { tag: [tags.tagName, tags.macroName, tags.annotation], color: 'var(--accent)' },
    { tag: [tags.meta, tags.punctuation, tags.separator, tags.bracket], color: 'var(--fg-dim)' },
    { tag: [tags.heading], color: 'var(--fg-bright)', fontWeight: 'bold' },
    { tag: [tags.emphasis], fontStyle: 'italic' },
    { tag: [tags.strong], fontWeight: 'bold' },
    { tag: [tags.link, tags.url], color: 'var(--tone-3)', textDecoration: 'underline' },
    { tag: [tags.inserted], color: 'var(--ok)' },
    { tag: [tags.deleted, tags.invalid], color: 'var(--err-text)' },
  ],
  // Concrete CSS variables, so themeType matching is irrelevant: this style
  // applies whatever CodeMirror thinks the theme's darkness is.
  { themeType: undefined },
)
