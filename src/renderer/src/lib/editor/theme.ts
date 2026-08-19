/** The buffer column's look, from the app's own variables (spec D2).
 *
 *  CodeMirror paints through this extension and nothing else — no bundled
 *  theme, so the buffer cannot drift off-palette when the accent moves. */

import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

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
    // OCARINA has the keyboard, so the buffer draws no cursor at all — a
    // ghost outline reads as "keys go here", which is exactly the lie.
    // `display` because the plugin styles its outline at highest precedence;
    // it never sets display, so this wins without a fight.
    '&:not(.cm-focused) .cm-fat-cursor': {
      display: 'none',
    },
    // Visual mode's band. The vim plugin hides the native selection, so this
    // paints drawSelection's layer — and it must read as a band, not a tint:
    // the selection is the entire point of the mode.
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 24%, transparent)',
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

/** Syntax colours from the same tokens the rest of the app paints with — the
 *  accent hue leads, the two derived tones carry names and types, and the
 *  status colours (`--ok`, `--warn`, `--err`) keep the meanings they have
 *  everywhere else: strings are ok-green, numbers warn-amber, invalid is err. */
export const ocarinaHighlight = HighlightStyle.define(
  [
    { tag: [tags.keyword, tags.moduleKeyword, tags.controlKeyword], color: 'var(--accent)' },
    { tag: [tags.operator, tags.operatorKeyword, tags.definitionKeyword], color: 'var(--accent)' },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--ok-text)' },
    { tag: [tags.number, tags.bool, tags.atom, tags.null, tags.escape], color: 'var(--warn)' },
    { tag: [tags.comment, tags.docComment], color: 'var(--fg-dimmest)', fontStyle: 'italic' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--tone-2)' },
    { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--tone-3)' },
    { tag: [tags.propertyName, tags.attributeName, tags.labelName], color: 'var(--fg-body)' },
    { tag: [tags.variableName, tags.definition(tags.variableName)], color: 'var(--fg)' },
    { tag: [tags.tagName, tags.macroName, tags.annotation], color: 'var(--tone-2)' },
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
