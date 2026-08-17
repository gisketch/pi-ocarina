/** Everything a pi session is built out of besides its model.
 *
 *  The inline extensions this app injects live here — the approval gate,
 *  `ask_user`, `spawn_agents` and `fetch` — because they are the interesting
 *  part and the factory above them is otherwise about pi's construction quirks.
 *
 *  Which of them a session gets depends on what it is. A thread gets all three.
 *  A child gets the gate and nothing else: its question would arrive in the
 *  parent's column with none of the parent's context around it, and only a
 *  child with a saved role, at depth one, may spawn. */

import type { ExtensionFactory } from '@earendil-works/pi-coding-agent'
import type { ApprovalGate } from './approvals'
import type { AskGate } from './ask-gate'
import { askUserTool } from './ask-tool'
import { fetchTool } from './fetch-tool'
import {
  appendNote,
  injectDiagnostics,
  lspToolsFor,
  promptLine,
  type LspExtensionDeps,
  type ResultEvent,
} from './lsp-extension'
import { spawnAgentsTool, type SpawnDeps } from './spawn-tool'
import type { Sdk } from './workspaces'
import type { ThreadHandle } from './session-factory'

type ResourceLoaderOf = InstanceType<Sdk['DefaultResourceLoader']>
// The `pi` object an inline extension is handed. pi's own type, so it cannot
// drift; the import is type-only and costs nothing at runtime.
type ExtensionApiOf = Parameters<ExtensionFactory>[0]

/** What a child session is, beyond a prompt and a tool list. */
export interface ChildShape {
  ask: boolean
  appendSystemPrompt: string
  depth: number
  spawns: boolean
  agent: { name: string; role: string }
  /** This child's own id in the fleet, so a fan-out it starts can lend its slot
   *  back while it waits. */
  selfId: string
}

export interface Deps {
  approvals: ApprovalGate
  asks: AskGate
  spawn: Omit<SpawnDeps, 'handle' | 'where' | 'depth'> | undefined
  where: ((workspaceId: string, cwd: string) => SpawnDeps['where']) | undefined
  /** Null when this workspace has no language servers switched on, which is
   *  the default and the case every session without them takes. */
  lsp?: (workspaceId: string, cwd: string) => LspExtensionDeps | null
}

/** Loads pi's usual resources plus this app's own extensions.
 *
 *  `tool_call` is pi's only place to stand between the model and the disk, and
 *  it can wait on a promise — so the approval handler simply asks the user and
 *  blocks until they answer. */
export async function buildResources(
  sdk: Sdk,
  deps: Deps,
  cwd: string,
  workspaceId: string,
  handle: ThreadHandle,
  child?: ChildShape,
): Promise<ResourceLoaderOf> {
  const { DefaultResourceLoader, getAgentDir } = sdk
  const { approvals: gate, asks, spawn, where } = deps
  const lsp = deps.lsp?.(workspaceId, cwd) ?? null
  const languages = lsp ? promptLine(await lsp.labels()) : ''

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    // Inline text, not a path: pi reads an entry as a file when one exists at
    // that name and takes it as the prompt itself otherwise. A role's
    // instructions are prose, so they arrive as prose.
    // A child's role, and the languages this workspace speaks. Both are prose,
    // and pi takes an entry as prose when no file exists at that name.
    ...(child || languages !== ''
      ? {
          appendSystemPrompt: [
            ...(child ? [child.appendSystemPrompt] : []),
            ...(languages !== '' ? [languages] : []),
          ],
        }
      : {}),
    extensionFactories: [
      ...(child?.ask === false
        ? []
        : [
            {
              // pi 0.84 has no elicitation of its own, so the only way an
              // agent can ask a person anything is a tool this app gives it.
              name: 'piocarina-ask',
              factory: (pi: ExtensionApiOf) => {
                pi.registerTool(askUserTool(asks, handle))
              },
            },
          ]),
      // Two levels, and the limit is enforced by simply not giving the tool
      // to anyone deep enough to break it. A grandchild that could spawn
      // would make the tree deeper than the column can indent, and would
      // multiply a cap that is meant to bound the whole app.
      ...(!canSpawn(child?.depth ?? 0, child?.spawns ?? true) || !spawn || !where
        ? []
        : [
            {
              name: 'piocarina-agents',
              factory: (pi: ExtensionApiOf) => {
                pi.registerTool(
                  spawnAgentsTool({
                    ...spawn!,
                    handle,
                    where: where!(workspaceId, cwd),
                    depth: child?.depth ?? 0,
                    selfId: child?.selfId,
                  }),
                )
              },
            },
          ]),
      ...(lsp === null
        ? []
        : [
            {
              // The six tools, plus the hook that makes an edit report its own
              // damage. A child holds them only if its role's tool list names
              // them, which pi enforces for custom tools.
              name: 'piocarina-lsp',
              factory: (pi: ExtensionApiOf) => {
                for (const tool of lspToolsFor(lsp)) pi.registerTool(tool)

                pi.on('tool_result', async (event) => {
                  appendNote(
                    event as unknown as ResultEvent,
                    await injectDiagnostics(lsp, event as unknown as ResultEvent),
                  )
                  return undefined
                })
              },
            },
          ]),
      {
        // Every session gets it. A child only holds it if its role's tool list
        // names it — pi filters custom tools by that list too — so the shipped
        // read-only roles do not reach the network by default.
        name: 'piocarina-fetch',
        factory: (pi: ExtensionApiOf) => {
          pi.registerTool(fetchTool())
        },
      },
      {
        name: 'piocarina-approvals',
        factory: (pi) => {
          pi.on('tool_call', async (event) => {
            const verdict = await gate.request({
              threadId: handle.threadId,
              workspaceId,
              toolName: event.toolName,
              input: event.input,
              toolCallId: event.toolCallId,
              // The same gate, the same rules, the same thread — and, when a
              // child raised it, the name the card needs to be answerable.
              agent: child?.agent,
            })
            return verdict.blocked ? { block: true, reason: verdict.reason } : undefined
          })
        },
      },
    ],
  })

  // A freshly constructed loader holds nothing: without this the extension is
  // never built, and the gate silently never runs. Learned the hard way.
  await loader.reload()
  return loader
}

/** Whether an agent at this depth, under this role, may spawn children.
 *
 *  Two rules in one place: the tree is at most two levels deep, and only a
 *  saved role spawns. The second is what stops an inline child — read-only by
 *  decision 13 — from starting a `developer` and writing through it. */
export function canSpawn(depth: number, spawns: boolean): boolean {
  return depth < 2 && spawns
}
