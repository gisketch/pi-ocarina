/** What the reader's configuration file says, and what in it did not load.
 *
 *  Read once, at launch, by main. The renderer never opens the file — it asks
 *  what main read. There is no save: the app does not write this file, so a
 *  hand-edit can never be lost to a save the reader did not make.
 *
 *  The harness has no backend and shows an empty file with no problems, which
 *  is what most readers have. */

import { bridge } from '../bridge'
import { keymapProblems } from '../keymap'
import { keybinds } from './keybinds.svelte'
import { EMPTY_CONFIG, type AppConfig, type ConfigProblem } from '../../../../shared/config-file'

class ConfigState {
  config = $state.raw<AppConfig>(EMPTY_CONFIG)
  problems = $state.raw<ConfigProblem[]>([])
  path = $state('')

  get broken(): boolean {
    return this.problems.length > 0
  }

  async load(): Promise<void> {
    if (!bridge) return
    this.#take(await bridge.config.load())
  }

  /** Re-reads the file from disk. What `/reload` does for this half. */
  async reload(): Promise<void> {
    if (!bridge) return
    this.#take(await bridge.config.reload())
  }

  #take(answer: { path: string; config: AppConfig; problems: ConfigProblem[] }): void {
    this.config = answer.config
    this.problems = answer.problems
    this.path = answer.path

    // Applied here rather than by the shell reading this store: the bindings
    // are an input to the reducer, and handing them over once at load keeps
    // the keyboard from re-deriving them on every keystroke. The rebuild
    // merges the Keymaps screen's saves underneath these — hand wins.
    keybinds.rebuild()

    // A binding the keymap will not honour is a key that silently does
    // nothing, which is the failure this file exists to prevent.
    this.problems = [
      ...this.problems,
      ...keymapProblems(answer.config.keys).map(({ binding, message }) => ({
        where: `keys ${binding.mode} ${binding.key}`,
        message,
      })),
    ]
  }
}

export const config = new ConfigState()
