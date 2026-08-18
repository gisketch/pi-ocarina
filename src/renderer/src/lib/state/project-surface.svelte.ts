/** What the open workspace loaded, as its settings screen sees it.
 *
 *  Main owns the answer: pi's resource loader lives beside the session, and the
 *  renderer never opens a file. This is a copy the screen draws, refreshed when
 *  the screen opens and when the reader asks for it, because a skill edited on
 *  disk does not reach the agent until something re-reads it.
 *
 *  The browser harness has no backend, so it shows a plausible workspace: a
 *  screen that says "error" where a list belongs cannot be reviewed against the
 *  design. */

import {
  EMPTY_SURFACE,
  surfaceIsEmpty,
  type ProjectSurface,
} from '../../../../shared/project-surface'
import { session } from '../session'

const DEMO: ProjectSurface = {
  commands: [
    { name: 'ship', description: 'run the checks, then commit', source: 'project', path: '.pi/prompts/ship.md' },
  ],
  skills: [
    {
      name: 'skill-creator',
      description: 'write a new skill from a description',
      source: 'app',
      path: 'resources/skills/skill-creator/SKILL.md',
      explicitOnly: false,
    },
    {
      name: 'reviewer',
      description: 'review a change against this repository’s rules',
      source: 'project',
      path: '.pi/skills/reviewer/SKILL.md',
      explicitOnly: false,
    },
  ],
  instructionFiles: [{ path: 'AGENTS.md', content: '# Agents\n\nRead docs/ first.\n' }],
  systemPromptSource: undefined,
  problems: [{ path: '.pi/skills/broken/SKILL.md', message: 'frontmatter has no name' }],
}

class ProjectSurfaceState {
  surface = $state.raw<ProjectSurface>(EMPTY_SURFACE)
  loading = $state(false)
  error = $state<string | null>(null)
  /** Which instruction file is open, by path. One at a time: the pane scrolls,
   *  and two open files would push the rows the reader came for off screen. */
  reading = $state<string | null>(null)

  #threadId = ''

  get empty(): boolean {
    return surfaceIsEmpty(this.surface)
  }

  /** The content of the file the reader opened, if it is still in the surface. */
  get open(): string | null {
    if (this.reading === null) return null
    return this.surface.instructionFiles.find((one) => one.path === this.reading)?.content ?? null
  }

  toggle(path: string): void {
    this.reading = this.reading === path ? null : path
  }

  async load(threadId: string): Promise<void> {
    this.#threadId = threadId
    this.reading = null

    if (!session.wired) {
      this.surface = DEMO
      return
    }

    this.loading = true
    this.error = null
    try {
      const { surface } = await session.invoke('projectSurface', { threadId })
      this.surface = surface
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause)
      this.surface = EMPTY_SURFACE
    } finally {
      this.loading = false
    }
  }

  /** Re-read after the reader changed something on disk. */
  async refresh(): Promise<void> {
    if (this.#threadId !== '') await this.load(this.#threadId)
  }
}

export const projectSurface = new ProjectSurfaceState()
