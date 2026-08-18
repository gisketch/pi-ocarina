/** The bindings the app ships, and the reader's changes to them.
 *
 *  A remap rather than a rewrite. The reducer stays a switch over keys — pure,
 *  and tested as pure — and this translates the key it is given first. Binding
 *  `x` to the action `l` already had means the reducer sees `l`, so the two can
 *  never disagree about what `l` does.
 *
 *  Configuration is an input to the reducer, never a lookup performed inside
 *  it. */

import type { KeyBinding } from '../../../shared/config-file'

/** Every action a reader may move, and where the app puts it.
 *
 *  Not every key in the app: `Escape` and the keys that enter a mode are fixed,
 *  and the parser refuses them. What is here is what can move without leaving
 *  the reader somewhere they cannot get out of. */
export const SHIPPED_KEYS: Readonly<Record<string, { mode: KeyBinding['mode']; key: string }>> = {
  'thread.prev': { mode: 'NORMAL', key: 'h' },
  'thread.next': { mode: 'NORMAL', key: 'l' },
  'block.down': { mode: 'READ', key: 'j' },
  'block.up': { mode: 'READ', key: 'k' },
  'block.open': { mode: 'READ', key: 'l' },
  'leader.start': { mode: 'NORMAL', key: ' ' },
  'changes.open': { mode: 'NORMAL', key: 'd' },
  'workspace.settings': { mode: 'NORMAL', key: '<' },
  'reasoning.toggle': { mode: 'NORMAL', key: 'o' },
  'leader.model': { mode: 'LEADER', key: 'm' },
  'leader.mode': { mode: 'LEADER', key: 'M' },
  'leader.settings': { mode: 'LEADER', key: 's' },
  'leader.workspace': { mode: 'LEADER', key: 'S' },
  'leader.newThread': { mode: 'LEADER', key: 'n' },
  'leader.closeThread': { mode: 'LEADER', key: 'x' },
  'leader.terminal': { mode: 'LEADER', key: 't' },
  'leader.compact': { mode: 'LEADER', key: 'c' },
  'leader.permission': { mode: 'LEADER', key: 'p' },
  'leader.switcher': { mode: 'LEADER', key: 'w' },
  'leader.find': { mode: 'LEADER', key: 'f' },
  'leader.keymap': { mode: 'LEADER', key: 'k' },
}

export function isAction(name: string): boolean {
  return Object.hasOwn(SHIPPED_KEYS, name)
}

/** Every binding the keymap will not honour, and why.
 *
 *  Reported rather than ignored. A typo in an action name is a key that
 *  silently does nothing, and so is a binding written in the wrong mode — the
 *  parser accepts `DIFF`, but no action lives there, so every `DIFF` binding
 *  was being dropped without a word. */
export function keymapProblems(
  bindings: readonly KeyBinding[],
): { binding: KeyBinding; message: string }[] {
  return bindings.flatMap((binding) => {
    const shipped = SHIPPED_KEYS[binding.action]
    if (!shipped) return [{ binding, message: `no such action: ${binding.action}` }]
    if (shipped.mode !== binding.mode) {
      return [
        {
          binding,
          message: `${binding.action} lives in ${shipped.mode}, not ${binding.mode}`,
        },
      ]
    }
    return []
  })
}

export interface Keymap {
  /** `MODE key` → the key the reducer should see instead. */
  translate: ReadonlyMap<string, string>
}

const slot = (mode: string, key: string): string => `${mode} ${key}`

/** Builds the translation the reducer's caller applies.
 *
 *  Only keys the reader bound appear. Everything else keeps the shipped
 *  behaviour, which is what a reader who changed one key expects — and it means
 *  an empty configuration file changes nothing at all. */
export function buildKeymap(bindings: readonly KeyBinding[]): Keymap {
  const translate = new Map<string, string>()

  for (const binding of bindings) {
    const shipped = SHIPPED_KEYS[binding.action]
    if (!shipped) continue
    // A binding in the wrong mode is a binding for an action that does not
    // exist there. Left alone rather than moved: `j` in NORMAL is not `j` in
    // READ, and quietly relocating it would surprise.
    if (shipped.mode !== binding.mode) continue
    translate.set(slot(binding.mode, binding.key), shipped.key)
  }

  return { translate }
}

export const EMPTY_KEYMAP: Keymap = { translate: new Map() }

/** The key the reducer should act on.
 *
 *  The reader's own key wins. A shipped key that the reader gave to something
 *  else stops doing its old job, because its slot now translates elsewhere;
 *  every other shipped key is untouched. */
export function effectiveKey(keymap: Keymap, mode: string, key: string): string {
  return keymap.translate.get(slot(mode, key)) ?? key
}
