/** The two commands that read what a project told the agent.
 *
 *  Split from the driver's own switch for the reason the roles and permission
 *  commands were: they are about files on disk rather than about running a
 *  turn, and the driver is the longest file in main. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { CommandName, CommandParams } from '../../shared/commands'
import { readSurface, reloadResources } from './project-surface'
import { agentDirOf, SHIPPED_RESOURCES } from './resource-dirs'
import type { Sdk } from './workspaces'

export interface ProjectDeps {
  /** The open thread's session, or a throw if the thread is unknown — the same
   *  contract the registry gives every other command. */
  session: (threadId: string) => AgentSession
  cwdOf: (threadId: string) => string | undefined
  sdk: () => Promise<Sdk>
}

export async function handleProject(
  deps: ProjectDeps,
  name: CommandName,
  params: unknown,
): Promise<unknown> {
  const { threadId } = params as CommandParams<'projectSurface'>
  const session = deps.session(threadId)

  const where = async () => ({
    cwd: deps.cwdOf(threadId) ?? '',
    agentDir: agentDirOf(await deps.sdk()),
    appDir: SHIPPED_RESOURCES,
  })

  if (name === 'projectSurface') {
    return { surface: readSurface(session, await where()) }
  }

  // A reload rewrites the system prompt. pi builds that per request, so one
  // landing mid-turn would leave the next turn running under different
  // instructions than the last, with nothing in the transcript saying so.
  if (session.isStreaming) {
    return { reloaded: false, because: 'this thread is working — reload when it finishes' }
  }

  await reloadResources(session)
  return { surface: readSurface(session, await where()), reloaded: true }
}
