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

export interface ShippedKey {
  mode: KeyBinding['mode']
  /** The default press: `event.key`, or `C-x` for a control chord. */
  key: string
  /** What the Keymaps screen and the `␣k` sheet call it. */
  label: string
  /** Which heading it sits under on those screens. */
  group: string
}

/** Every action a reader may move, and where the app puts it — the registry
 *  the Keymaps screen edits and the completeness sweep checks.
 *
 *  Not quite every key in the app: `Escape` is the one way out and stays
 *  fixed, digits are positional, arrows are fixed synonyms for hjkl, and
 *  `Enter` only acts on the empty welcome screen. Everything else is here. */
export const SHIPPED_KEYS: Readonly<Record<string, ShippedKey>> = {
  'thread.prev': { mode: 'NORMAL', key: 'h', label: 'previous thread', group: 'navigate' },
  'thread.next': { mode: 'NORMAL', key: 'l', label: 'next thread', group: 'navigate' },
  'read.down': { mode: 'NORMAL', key: 'j', label: 'enter read · block down', group: 'navigate' },
  'read.up': { mode: 'NORMAL', key: 'k', label: 'enter read · block up', group: 'navigate' },
  'scroll.down': { mode: 'NORMAL', key: 'C-d', label: 'half page down', group: 'navigate' },
  'scroll.up': { mode: 'NORMAL', key: 'C-u', label: 'half page up', group: 'navigate' },
  'column.left': { mode: 'NORMAL', key: 'H', label: 'move column left', group: 'navigate' },
  'column.right': { mode: 'NORMAL', key: 'L', label: 'move column right', group: 'navigate' },
  'thread.jumpLive': { mode: 'NORMAL', key: 'G', label: 'jump to latest', group: 'navigate' },
  'terminal.open': { mode: 'NORMAL', key: 't', label: 'terminal column', group: 'navigate' },
  'thread.rename': { mode: 'NORMAL', key: 'R', label: 'rename thread', group: 'navigate' },
  'leader.start': { mode: 'NORMAL', key: ' ', label: 'leader chord', group: 'navigate' },
  'compose.insert': { mode: 'NORMAL', key: 'i', label: 'compose (insert)', group: 'navigate' },
  'yank.code': { mode: 'NORMAL', key: 'y', label: 'yank last code', group: 'navigate' },
  'reasoning.toggle': { mode: 'NORMAL', key: 'o', label: 'toggle reasoning', group: 'navigate' },
  'block.menu': { mode: 'NORMAL', key: 'a', label: 'block actions', group: 'navigate' },
  'leap.start': { mode: 'NORMAL', key: 's', label: 'leap to block', group: 'navigate' },

  'changes.open': { mode: 'NORMAL', key: 'd', label: 'change viewer', group: 'screens' },
  'switcher.open': { mode: 'NORMAL', key: 'w', label: 'thread switcher', group: 'screens' },
  'keymap.open': { mode: 'NORMAL', key: '?', label: 'keymap sheet', group: 'screens' },
  'settings.open': { mode: 'NORMAL', key: ',', label: 'settings', group: 'screens' },
  'workspace.settings': { mode: 'NORMAL', key: '<', label: 'workspace settings', group: 'screens' },
  'model.open': { mode: 'NORMAL', key: 'm', label: 'model picker', group: 'screens' },
  'mode.pick': { mode: 'NORMAL', key: 'M', label: 'voice picker', group: 'screens' },
  'search.open': { mode: 'NORMAL', key: '/', label: 'search threads', group: 'screens' },

  'block.down': { mode: 'READ', key: 'j', label: 'block down', group: 'read' },
  'block.up': { mode: 'READ', key: 'k', label: 'block up', group: 'read' },
  'block.open': { mode: 'READ', key: 'l', label: 'expand block', group: 'read' },
  'block.close': { mode: 'READ', key: 'h', label: 'collapse block', group: 'read' },

  'diff.down': { mode: 'DIFF', key: 'j', label: 'next file · line down', group: 'diff' },
  'diff.up': { mode: 'DIFF', key: 'k', label: 'previous file · line up', group: 'diff' },
  'diff.pane': { mode: 'DIFF', key: 'Tab', label: 'swap pane', group: 'diff' },
  'diff.diffPane': { mode: 'DIFF', key: 'l', label: 'diff pane', group: 'diff' },
  'diff.filesPane': { mode: 'DIFF', key: 'h', label: 'files pane', group: 'diff' },
  'diff.top': { mode: 'DIFF', key: 'g', label: 'first file (gg)', group: 'diff' },
  'diff.bottom': { mode: 'DIFF', key: 'G', label: 'last file', group: 'diff' },
  'diff.hunkNext': { mode: 'DIFF', key: 'n', label: 'next hunk', group: 'diff' },
  'diff.hunkPrev': { mode: 'DIFF', key: 'N', label: 'previous hunk', group: 'diff' },
  'diff.yank': { mode: 'DIFF', key: 'y', label: 'yank diff', group: 'diff' },
  'diff.filter': { mode: 'DIFF', key: '/', label: 'filter files', group: 'diff' },

  'leader.model': { mode: 'LEADER', key: 'm', label: 'model picker', group: 'leader' },
  'leader.mode': { mode: 'LEADER', key: 'M', label: 'voice picker', group: 'leader' },
  'leader.settings': { mode: 'LEADER', key: 's', label: 'settings', group: 'leader' },
  'leader.workspace': { mode: 'LEADER', key: 'S', label: 'workspace settings', group: 'leader' },
  'leader.newThread': { mode: 'LEADER', key: 'n', label: 'new thread', group: 'leader' },
  'leader.closeThread': { mode: 'LEADER', key: 'x', label: 'close column', group: 'leader' },
  'leader.terminal': { mode: 'LEADER', key: 't', label: 'terminal column', group: 'leader' },
  'leader.compact': { mode: 'LEADER', key: 'c', label: 'compact thread', group: 'leader' },
  'leader.permission': { mode: 'LEADER', key: 'p', label: 'cycle permission', group: 'leader' },
  'leader.switcher': { mode: 'LEADER', key: 'w', label: 'thread switcher', group: 'leader' },
  'leader.find': { mode: 'LEADER', key: 'f', label: 'find thread', group: 'leader' },
  'leader.keymap': { mode: 'LEADER', key: 'k', label: 'keymap sheet', group: 'leader' },
  'leader.changes': { mode: 'LEADER', key: 'd', label: 'change viewer', group: 'leader' },
  'leader.threadPrev': { mode: 'LEADER', key: 'h', label: 'previous thread', group: 'leader' },
  'leader.threadNext': { mode: 'LEADER', key: 'l', label: 'next thread', group: 'leader' },
}

/** A keydown as the keymap spells it: `event.key`, or `C-x` with control
 *  held. Meta and alt chords are not the keymap's to move — the browser and
 *  the OS own those — so they encode as the bare key and never match a
 *  binding slot that a control chord would. */
export function encodePress(event: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}): string {
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
    return `C-${event.key}`
  }
  return event.key
}

/** The encoded press back as the event shape the reducer reads. */
export function decodePress(press: string): { key: string; ctrlKey: boolean } {
  if (press.startsWith('C-') && press.length === 3) {
    return { key: press.slice(2), ctrlKey: true }
  }
  return { key: press, ctrlKey: false }
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

/** The keys READ answers itself before the NORMAL bindings fall through.
 *  A NORMAL translation must never shadow these — stealing NORMAL `h` does
 *  not take READ's collapse with it. */
const READ_OWNS: ReadonlySet<string> = new Set(
  Object.values(SHIPPED_KEYS)
    .filter((entry) => entry.mode === 'READ')
    .map((entry) => entry.key),
)

/** The key the reducer should act on.
 *
 *  The reader's own key wins. A shipped key that the reader gave to something
 *  else stops doing its old job, because its slot now translates elsewhere;
 *  every other shipped key is untouched.
 *
 *  READ inherits the NORMAL translations for the keys it does not own,
 *  because the NORMAL bindings themselves fall through to READ — a reader who
 *  moved `y` to `c` expects `c` to yank from READ, the same way `y` did. */
export function effectiveKey(keymap: Keymap, mode: string, key: string): string {
  const own = keymap.translate.get(slot(mode, key))
  if (own !== undefined) return own
  if (mode === 'READ' && !READ_OWNS.has(key)) {
    return keymap.translate.get(slot('NORMAL', key)) ?? key
  }
  return key
}
