/** The completeness contract between the reducer and the registry.
 *
 *  Every key the reducer consumes must be a registered action, or the Keymaps
 *  screen lies by omission: a key that works but has no row cannot be seen or
 *  moved. Swept rather than listed, so adding a `case` without a registry
 *  entry fails here instead of shipping silently. */

import { describe, expect, it } from 'vitest'
import { initialKeyState, reduceKey, type KeyContext, type KeyState } from './keyboard'
import { encodePress, SHIPPED_KEYS } from './keymap'

const ctx: KeyContext = { workspaceCount: 3, terminalColumn: false }

/** Deliberately unregistered: `Escape` is the one way out, digits are
 *  positional, arrows are fixed synonyms for hjkl, `Enter` only acts on the
 *  empty welcome screen, and `^k` is the palette — the sibling of `⌘K`, the
 *  command escape hatch that must work whatever the keymap says. */
const FIXED = new Set(['Escape', 'Enter', '1', '2', '3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'C-k'])

const CHARS = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,.<>/?;:'"[]{}\\|\`~!@#$%^&*()-_=+ `

function presses(): { key: string; ctrlKey?: boolean }[] {
  const plain = [...CHARS].map((key) => ({ key }))
  const chords = [...'abcdefghijklmnopqrstuvwxyz'].map((key) => ({ key, ctrlKey: true }))
  return [...plain, ...chords]
}

const registered = new Set(
  Object.values(SHIPPED_KEYS).map((entry) => `${entry.mode} ${entry.key}`),
)

function consumed(
  mode: KeyState['mode'],
  before: KeyState,
  event: { key: string; ctrlKey?: boolean },
  where: KeyContext = ctx,
): boolean {
  const after = reduceKey(before, event, where)
  if (after.actions.length > 0) return true
  if (after.state.overlay !== before.overlay) return true
  if (mode === 'LEADER') return after.state.mode !== 'OCARINA' && after.state.mode !== mode
  return after.state.mode !== mode
}

describe('every consumed key is a registered action', () => {
  for (const mode of ['OCARINA', 'LEADER'] as const) {
    it(`in ${mode}`, () => {
      const before: KeyState = { ...initialKeyState, mode }
      const naked: string[] = []
      for (const event of presses()) {
        const press = encodePress(event)
        if (FIXED.has(press)) continue
        // The scroll chords act in every mode, above the mode branches; their
        // one registration is the OCARINA one, so any mode may resolve to it.
        const known = registered.has(`${mode} ${press}`) || registered.has(`OCARINA ${press}`)
        if (consumed(mode, before, event) && !known) {
          naked.push(press)
        }
      }
      expect(naked).toEqual([])
    })
  }

  it('in READ, for the keys READ itself owns', () => {
    // The rest of READ's keys are the NORMAL bindings falling through, and
    // those are covered above.
    for (const key of ['j', 'k', 'l', 'h']) {
      expect(registered.has(`READ ${key}`)).toBe(true)
    }
  })
})

describe('every registry default lands on its action', () => {
  for (const [action, entry] of Object.entries(SHIPPED_KEYS)) {
    if (entry.mode === 'DIFF') continue // the changes viewer owns those keys
    it(`${action} via ${entry.mode} ${entry.key}`, () => {
      const before: KeyState = { ...initialKeyState, mode: entry.mode }
      const event = entry.key.startsWith('C-')
        ? { key: entry.key.slice(2), ctrlKey: true }
        : { key: entry.key }
      // The buffer keys act only when the focused column is a buffer.
      const where = entry.group === 'buffer' ? { ...ctx, bufferColumn: true } : ctx
      expect(consumed(entry.mode, before, event, where)).toBe(true)
    })
  }
})
