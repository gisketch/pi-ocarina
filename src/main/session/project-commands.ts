/** The two commands that read what a project told the agent.
 *
 *  Split from the driver's own switch for the reason the roles and permission
 *  commands were: they are about files on disk rather than about running a
 *  turn, and the driver is the longest file in main. */

import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { CommandName, CommandParams } from '../../shared/commands'
import { readSurface, reloadResources, workspaceLoader } from './project-surface'
import { agentDirOf, SHIPPED_RESOURCES } from './resource-dirs'
import type { Sdk } from './workspaces'

export interface ProjectDeps {
  /** The open thread's session, or a throw if the thread is unknown — the same
   *  contract the registry gives every other command. */
  session: (threadId: string) => AgentSession
  /** The same lookup without the throw, for a read that is happy to answer
   *  about the folder when no thread is open in it. */
  find: (threadId: string) => AgentSession | undefined
  cwdOf: (threadId: string) => string | undefined
  pathOf: (workspaceId: string) => string
  sdk: () => Promise<Sdk>
}

export async function handleProject(
  deps: ProjectDeps,
  name: CommandName,
  params: unknown,
): Promise<unknown> {
  const where = async (cwd: string) => ({
    cwd,
    agentDir: agentDirOf(await deps.sdk()),
    appDir: SHIPPED_RESOURCES,
  })

  // Read first, and never resolve a session to do it. A surface is what a
  // folder told the agent, so it is answerable for a workspace whose threads
  // are all closed — which used to reject with `unknown thread: fresh:<id>`
  // and paint the screen with the raw message.
  if (name === 'projectSurface') {
    const { workspaceId, threadId } = params as CommandParams<'projectSurface'>
    if (threadId !== undefined) {
      const open = deps.find(threadId)
      // A thread narrows the answer to what it actually loaded — its own
      // checkout, which for an isolated thread is not the workspace's folder.
      if (open) {
        return { surface: readSurface(open.resourceLoader, await where(deps.cwdOf(threadId) ?? '')) }
      }
    }

    const cwd = deps.pathOf(workspaceId)
    return { surface: readSurface(await workspaceLoader(await deps.sdk(), cwd), await where(cwd)) }
  }

  // A reload is the other half, and it genuinely needs a session: it rebuilds
  // the prompt pi has cached inside one. A column with no session has no
  // cached prompt to rebuild, which is why `/reload` is not offered there.
  const { threadId } = params as CommandParams<'reloadProject'>
  const session = deps.session(threadId)

  // pi builds the prompt per request, so a reload landing mid-turn would leave
  // the next turn running under different instructions than the last, with
  // nothing in the transcript saying so.
  if (session.isStreaming) {
    return { reloaded: false, because: 'this thread is working — reload when it finishes' }
  }

  await reloadResources(session)
  const cwd = deps.cwdOf(threadId) ?? ''
  return { surface: readSurface(session.resourceLoader, await where(cwd)), reloaded: true }
}
