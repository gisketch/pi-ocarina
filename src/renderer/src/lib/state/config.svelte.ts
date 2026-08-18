/** What the reader's configuration file says, and what in it did not load.
 *
 *  Read once, at launch, by main. The renderer never opens the file — it asks
 *  what main read. There is no save: the app does not write this file, so a
 *  hand-edit can never be lost to a save the reader did not make.
 *
 *  The harness has no backend and shows an empty file with no problems, which
 *  is what most readers have. */

import { bridge } from '../bridge'
import { buildKeymap, unknownActions } from '../keymap'
import { shell } from './shell.svelte'
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

    const answer = await bridge.config.load()
    this.config = answer.config
    this.problems = answer.problems
    this.path = answer.path

    // Applied here rather than by the shell reading this store: the bindings
    // are an input to the reducer, and handing them over once at load keeps
    // the keyboard from re-deriving them on every keystroke.
    shell.keymap = buildKeymap(answer.config.keys)

    for (const binding of unknownActions(answer.config.keys)) {
      // A typo in an action name is a key that silently does nothing, which is
      // the failure this file exists to prevent.
      this.problems = [
        ...this.problems,
        { where: `keys ${binding.mode} ${binding.key}`, message: `no such action: ${binding.action}` },
      ]
    }
  }
}

export const config = new ConfigState()
