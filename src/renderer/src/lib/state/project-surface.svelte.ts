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
import type { ThreadId } from '../../../../shared/thread-id'
import { session } from '../session'
import { toasts } from './toasts.svelte'

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

  /** Which workspace the held surface describes. A singleton with no key was
   *  its own bug: skipping the load for a column with no thread would have
   *  left the previous workspace's commands in this workspace's `/` menu. */
  #workspaceId = ''
  #threadId: ThreadId | null = null

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

  async load(workspaceId: string, threadId: ThreadId | null): Promise<void> {
    this.#workspaceId = workspaceId
    this.#threadId = threadId
    this.reading = null

    if (!session.wired) {
      this.surface = DEMO
      return
    }

    this.loading = true
    this.error = null
    try {
      // The workspace always, the thread only when there is one. A column with
      // no session still sits in a folder, and that folder's commands are what
      // its first message will be sent under.
      const { surface } = await session.invoke('projectSurface', {
        workspaceId,
        ...(threadId === null ? {} : { threadId }),
      })
      this.surface = surface
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause)
      this.surface = EMPTY_SURFACE
    } finally {
      this.loading = false
    }
  }

  /** Re-read the files on disk, and say what happened.
   *
   *  Reported in the corner rather than in the thread: a reload is not
   *  something the turn did, and a refusal the reader cannot see would look
   *  like an edit that silently failed to take. */
  async reload(): Promise<boolean> {
    const threadId = this.#threadId
    // Nothing to re-prompt without a session. The menu does not offer `/reload`
    // on a column that has none, and this is the same answer said twice.
    if (threadId === null) return false

    if (!session.wired) {
      toasts.push({ tone: 'ok', text: 're-read this project' })
      return true
    }

    this.loading = true
    try {
      const answer = await session.invoke('reloadProject', { threadId })
      if (!answer.reloaded) {
        toasts.push({ tone: 'info', text: answer.because })
        return false
      }
      this.surface = answer.surface
      this.error = null
      toasts.push({ tone: 'ok', text: 're-read this project' })
      return true
    } catch (cause) {
      toasts.push({ tone: 'error', text: cause instanceof Error ? cause.message : String(cause) })
      return false
    } finally {
      this.loading = false
    }
  }
}

export const projectSurface = new ProjectSurfaceState()
