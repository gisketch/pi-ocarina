/** What actually reaches pi's system prompt.
 *
 *  The seam is `DefaultResourceLoader`'s options, so the test stands where the
 *  options are handed over: a fake sdk records them. Without this, "the voice
 *  is in the system prompt" is a claim no test pins — and it is the whole
 *  reason a mode is not just a message. */

import { describe, expect, it } from 'vitest'
import { MODE_BOUNDARY } from '../../shared/chat-modes'
import { ApprovalGate } from './approvals'
import { AskGate } from './ask-gate'
import { buildResources, type Deps } from './session-extensions'
import type { Sdk } from './workspaces'

function fakeSdk() {
  const seen: Record<string, unknown>[] = []
  class Recorder {
    constructor(options: Record<string, unknown>) {
      seen.push(options)
    }
    // `buildResources` reloads the loader it just built: a fresh one holds
    // nothing, so the extensions would never be constructed.
    async reload(): Promise<void> {}
  }
  const sdk = {
    DefaultResourceLoader: Recorder,
    getAgentDir: () => '/home/me/.pi',
  } as unknown as Sdk
  return { sdk, seen }
}

function deps(mode?: (threadId: string) => string[]): Deps {
  return {
    approvals: new ApprovalGate(
      () => {},
      {
        hasApproval: () => false,
        addApproval: () => {},
        removeApproval: () => {},
        listApprovals: () => [],
      },
      { levelFor: () => 'ask', pathFor: () => '/repo' },
    ),
    asks: new AskGate(() => {}),
    spawn: undefined,
    where: undefined,
    ...(mode ? { mode } : {}),
  }
}

const CHILD = {
  ask: false,
  appendSystemPrompt: 'You are a scout.',
  depth: 1,
  spawns: false,
  agent: { name: 'atlas', role: 'scout' },
  selfId: 'a1',
}

describe('a thread’s system prompt', () => {
  it('carries the voice and the boundary, and the boundary comes last', async () => {
    const { sdk, seen } = fakeSdk()
    await buildResources(sdk, deps(() => ['be brief', MODE_BOUNDARY]), '/repo', 'w1', {
      threadId: 't1',
    })

    const override = seen[0].appendSystemPromptOverride as (base: string[]) => string[]
    expect(override(['project instructions'])).toEqual([
      'project instructions',
      'be brief',
      MODE_BOUNDARY,
    ])
  })

  it('is an override, so a reload picks up a voice changed since the session started', async () => {
    // pi calls this on every load. A captured string would still be the old
    // voice after `/reload`.
    const { sdk, seen } = fakeSdk()
    let voice = ['first']
    await buildResources(sdk, deps(() => voice), '/repo', 'w1', { threadId: 't1' })

    const override = seen[0].appendSystemPromptOverride as (base: string[]) => string[]
    expect(override([])).toEqual(['first'])
    voice = ['second']
    expect(override([])).toEqual(['second'])
  })

  it('carries nothing when no voice is set', async () => {
    const { sdk, seen } = fakeSdk()
    await buildResources(sdk, deps(() => []), '/repo', 'w1', { threadId: 't1' })

    const override = seen[0].appendSystemPromptOverride as (base: string[]) => string[]
    expect(override(['project instructions'])).toEqual(['project instructions'])
  })

  it('has no override at all when the app has no modes wired', async () => {
    const { sdk, seen } = fakeSdk()
    await buildResources(sdk, deps(), '/repo', 'w1', { threadId: 't1' })

    expect(seen[0].appendSystemPromptOverride).toBeUndefined()
  })
})

describe('a child’s system prompt', () => {
  it('never carries the voice', async () => {
    // A child's final message is read by the parent, not by a person, and a
    // voice that trades completeness for reading speed helps nobody there.
    const { sdk, seen } = fakeSdk()
    await buildResources(
      sdk,
      deps(() => ['be brief', MODE_BOUNDARY]),
      '/repo',
      'w1',
      { threadId: 't1' },
      CHILD,
    )

    expect(seen[0].appendSystemPromptOverride).toBeUndefined()
    expect(seen[0].appendSystemPrompt).toEqual(['You are a scout.'])
  })
})

describe('every session', () => {
  it('is pointed at the skills this app ships', async () => {
    const { sdk, seen } = fakeSdk()
    await buildResources(sdk, deps(), '/repo', 'w1', { threadId: 't1' })

    const paths = seen[0].additionalSkillPaths as string[]
    expect(paths.some((one) => one.endsWith('/resources/skills'))).toBe(true)
  })
})
