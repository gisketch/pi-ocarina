/** The Keymaps screen's file, read at launch and rewritten whole on save.
 *
 *  Beside `config-store.ts`, with the opposite ownership: that file the app
 *  only reads; this one it writes, atomically, the way the catalog is
 *  written — a crash mid-save must not cost the reader their keymap. */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ConfigProblem } from '../shared/config-file'
import { parseKeymapFile, serializeKeymapFile, type KeymapKeys } from '../shared/keymap-file'

export const KEYMAP_FILE = 'keymap.json'

export function keymapPath(home: string): string {
  return join(home, '.piocarina', KEYMAP_FILE)
}

export class KeymapStore {
  readonly #file: string
  #keys: KeymapKeys = {}
  #problems: ConfigProblem[] = []

  constructor(file: string) {
    this.#file = file
  }

  get path(): string {
    return this.#file
  }

  get keys(): KeymapKeys {
    return this.#keys
  }

  get problems(): readonly ConfigProblem[] {
    return this.#problems
  }

  /** An absent file is nobody having rebound anything, not a problem. A file
   *  that exists and cannot be read is one — the same rule config-store
   *  learnt the hard way. */
  async load(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.#file, 'utf8')
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code
      this.#keys = {}
      this.#problems =
        code === 'ENOENT'
          ? []
          : [{ where: 'file', message: `could not be read — ${code ?? String(cause)}` }]
      return
    }

    const { keys, problems } = parseKeymapFile(text)
    this.#keys = keys
    this.#problems = problems
  }

  /** The whole keymap, every time. The screen holds the truth and the file
   *  mirrors it, so there is no merge to get wrong. */
  async save(keys: KeymapKeys): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true })
    const temp = `${this.#file}.tmp`
    await writeFile(temp, serializeKeymapFile(keys), 'utf8')
    await rename(temp, this.#file)
    this.#keys = keys
    this.#problems = []
  }
}
