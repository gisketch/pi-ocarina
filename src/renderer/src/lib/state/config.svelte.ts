/** What the reader's configuration file says, and what in it did not load.
 *
 *  Read once, at launch, by main. The renderer never opens the file — it asks
 *  what main read. There is no save: the app does not write this file, so a
 *  hand-edit can never be lost to a save the reader did not make.
 *
 *  The harness has no backend and shows an empty file with no problems, which
 *  is what most readers have. */

import { bridge } from '../bridge'
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
  }
}

export const config = new ConfigState()
