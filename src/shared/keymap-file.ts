/** The UI-owned keymap file: what the Keymaps screen saved.
 *
 *  The counterpart of `config-file.ts` with the ownership inverted. That file
 *  is the reader's, hand-written, never touched by the app; this one is the
 *  app's, written whole on every change, and hand-edits to it are legal but
 *  will be rewritten. When both bind the same action, the hand-written one
 *  wins — the merge in the renderer enforces it.
 *
 *  Shape: `{ "version": 1, "keys": { "thread.next": ";" } }` — action id to
 *  press, where a press is `event.key` or `C-x` for a control chord. Mode is
 *  not repeated; the action registry knows where each action lives. */

import type { ConfigProblem } from './config-file'

export type KeymapKeys = Record<string, string>

export interface KeymapFileLoad {
  keys: KeymapKeys
  problems: ConfigProblem[]
}

/** Reads the file's text. Bad entries are dropped one by one and named; a
 *  file that is not JSON at all costs only the rebinds, never the app. */
export function parseKeymapFile(text: string): KeymapFileLoad {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (cause) {
    return {
      keys: {},
      problems: [{ where: 'file', message: `not JSON — ${(cause as Error).message}` }],
    }
  }

  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return { keys: {}, problems: [{ where: 'file', message: 'expected an object' }] }
  }

  const raw = (root as { keys?: unknown }).keys
  if (raw === undefined) return { keys: {}, problems: [] }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { keys: {}, problems: [{ where: 'keys', message: 'expected an object' }] }
  }

  const keys: KeymapKeys = {}
  const problems: ConfigProblem[] = []
  for (const [action, press] of Object.entries(raw)) {
    if (typeof press !== 'string' || press === '') {
      problems.push({ where: `keys.${action}`, message: 'expected a key' })
      continue
    }
    if (press === 'Escape') {
      problems.push({
        where: `keys.${action}`,
        message: 'Escape cannot be given away — it is the one way out',
      })
      continue
    }
    keys[action] = press
  }
  return { keys, problems }
}

export function serializeKeymapFile(keys: KeymapKeys): string {
  return `${JSON.stringify({ version: 1, keys }, null, 2)}\n`
}
