/** The Keymaps screen's truth: what the reader rebound from the UI.
 *
 *  Three sources make the live keymap, weakest first: the shipped defaults,
 *  this store (persisted to `~/.piocarina/keymap.json` by main), and the
 *  hand-written `keys` in config.json. Hand beats UI — a reader who wrote a
 *  binding by hand meant it, and the screen shows such bindings as locked
 *  rather than silently fighting them.
 *
 *  Every change rebuilds `shell.keymap` first and saves after, so a rebind
 *  works on the very next keypress and a slow disk cannot delay it. */

import type { ConfigProblem, KeyBinding } from '../../../../shared/config-file'
import type { KeymapKeys } from '../../../../shared/keymap-file'
import { bridge } from '../bridge'
import { buildKeymap, effectiveKey, encodePress, isAction, SHIPPED_KEYS } from '../keymap'
import { config } from './config.svelte'
import { shell } from './shell.svelte'

/** The bindings the reducer's remap is built from. UI entries first, hand
 *  entries after — `buildKeymap` writes a Map, so on a shared slot the last
 *  writer wins, and the last writer is the hand. */
export function mergeBindings(ui: KeymapKeys, hand: readonly KeyBinding[]): KeyBinding[] {
  const handActions = new Set(hand.map((one) => one.action))
  const fromUi: KeyBinding[] = Object.entries(ui)
    .filter(([action]) => isAction(action) && !handActions.has(action))
    .map(([action, key]) => ({ mode: SHIPPED_KEYS[action].mode, key, action }))
  return [...fromUi, ...hand]
}

class Keybinds {
  /** Action id → press, exactly what keymap.json holds. */
  keys = $state.raw<KeymapKeys>({})
  problems = $state.raw<ConfigProblem[]>([])
  path = $state('')
  /** The action whose row is recording, or null. While set, the modal gate
   *  hands every key to `handleRecordKey` — which is what lets the next
   *  press be `w` or `Escape` without the shell reading either. */
  recording = $state<string | null>(null)

  async load(): Promise<void> {
    if (!bridge) return
    const answer = await bridge.keymap.load()
    this.path = answer.path
    this.keys = answer.keys
    // The parser cannot know the registry; the screen does. An entry for an
    // action that does not exist is a rebind that silently does nothing.
    this.problems = [
      ...answer.problems,
      ...Object.keys(answer.keys)
        .filter((action) => !isAction(action))
        .map((action) => ({ where: `keys.${action}`, message: `no such action: ${action}` })),
    ]
    this.rebuild()
  }

  /** Binds one action to one press. Stealing is implicit for shipped keys —
   *  the slot now translates elsewhere — but a press held by another UI
   *  rebind in the same mode must be removed, or two entries would fight
   *  over one slot by object order. */
  async set(action: string, press: string): Promise<void> {
    if (!isAction(action) || press === 'Escape' || press === '') return

    const mode = SHIPPED_KEYS[action].mode
    const next: KeymapKeys = {}
    for (const [other, key] of Object.entries(this.keys)) {
      if (other === action) continue
      if (key === press && SHIPPED_KEYS[other]?.mode === mode) continue
      next[other] = key
    }
    // Back to the shipped default is a reset, not an entry.
    if (press !== SHIPPED_KEYS[action].key) next[action] = press

    await this.#apply(next)
  }

  async reset(action: string): Promise<void> {
    if (!(action in this.keys)) return
    const next = { ...this.keys }
    delete next[action]
    await this.#apply(next)
  }

  async resetAll(): Promise<void> {
    await this.#apply({})
  }

  /** Rebuild first, save after: the keypress must not wait for the disk. */
  async #apply(next: KeymapKeys): Promise<void> {
    this.keys = next
    this.rebuild()
    await bridge?.keymap.save(next)
  }

  rebuild(): void {
    shell.keymap = buildKeymap(mergeBindings(this.keys, config.config.keys))
  }

  /** One key while a row is recording. Escape cancels — which is why it can
   *  never be captured — and a bare modifier waits for the rest of its chord. */
  handleRecordKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
    const action = this.recording
    if (action === null) return false
    if (MODIFIER_KEYS.has(event.key)) return false

    this.recording = null
    if (event.key === 'Escape') return true
    void this.set(action, encodePress(event))
    return true
  }

  /** What a row shows: the UI's press, else the hand's, else the shipped. */
  pressOf(action: string): string {
    const ui = this.keys[action]
    if (ui !== undefined) return ui
    const hand = config.config.keys.find((one) => one.action === action)
    return hand?.key ?? SHIPPED_KEYS[action]?.key ?? ''
  }

  /** Whether config.json holds this action — the screen shows it locked
   *  rather than silently fighting a hand-written binding. */
  lockedBy(action: string): boolean {
    return config.config.keys.some((one) => one.action === action)
  }

  /** Whether this action's key was stolen: the press its row shows no longer
   *  reaches it. Derived, never stored — a steal is just a slot that
   *  translates elsewhere now. */
  unbound(action: string): boolean {
    const shipped = SHIPPED_KEYS[action]
    if (!shipped) return false
    return effectiveKey(shell.keymap, shipped.mode, this.pressOf(action)) !== shipped.key
  }
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

export const keybinds = new Keybinds()
