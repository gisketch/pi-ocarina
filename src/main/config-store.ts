/** The reader's configuration file, read once at launch.
 *
 *  Read, never written. The app has no editor for this file and will not gain
 *  one: the moment it writes here, a hand-edit can be lost at a save the reader
 *  did not make. Everything the app owns lives in the catalog instead. */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EMPTY_CONFIG,
  parseConfig,
  type AppConfig,
  type ConfigProblem,
} from '../shared/config-file'

export const CONFIG_FILE = 'config.json'

export function configPath(home: string): string {
  return join(home, '.piocarina', CONFIG_FILE)
}

export class ConfigStore {
  readonly #file: string
  #config: AppConfig = EMPTY_CONFIG
  #problems: ConfigProblem[] = []

  constructor(file: string) {
    this.#file = file
  }

  get path(): string {
    return this.#file
  }

  get config(): AppConfig {
    return this.#config
  }

  get problems(): readonly ConfigProblem[] {
    return this.#problems
  }

  /** Reads the file. An absent file is not a problem — most readers never write
   *  one, and reporting its absence would be reporting the default.
   *
   *  Anything else is. A file that exists and cannot be read — the wrong
   *  permissions, a directory where a file should be — looked exactly like no
   *  file at all, so a reader whose bindings had silently stopped working had
   *  nothing to go on. */
  async load(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.#file, 'utf8')
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code
      this.#config = EMPTY_CONFIG
      this.#problems =
        code === 'ENOENT'
          ? []
          : [{ where: 'file', message: `could not be read — ${code ?? String(cause)}` }]
      return
    }

    const { config, problems } = parseConfig(text)
    this.#config = config
    this.#problems = problems
  }
}
