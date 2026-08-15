import { beforeEach, describe, expect, it } from 'vitest'
import { app } from './app.svelte'
import { threads } from './threads.svelte'
import { EMPTY_THREAD } from '../thread'
import { stripOffset } from '../strip'

beforeEach(() => {
  app.goWorkspace(0)
  app.focus = app.workspaces.map(() => 0)
  app.mode = 'NORMAL'
})

describe('workspace navigation', () => {
  it('switches workspace and exposes its identity', () => {
    app.goWorkspace(1)
    expect(app.workspace.name).toBe('ocarina-ui')
    expect(app.workspace.hue).toBe(265)
    expect(app.workspace.note).toBe('F♯')
  })

  it('ignores out-of-range workspaces', () => {
    app.goWorkspace(99)
    expect(app.workspaceIndex).toBe(0)
    app.goWorkspace(-1)
    expect(app.workspaceIndex).toBe(0)
  })
})

describe('thread focus', () => {
  it('moves and clamps within the workspace', () => {
    app.moveThread(1)
    expect(app.threadIndex).toBe(1)
    app.moveThread(1)
    expect(app.threadIndex).toBe(2)
    app.moveThread(1) // pi-core has 3 threads — must stop here
    expect(app.threadIndex).toBe(2)
    app.moveThread(-9)
    expect(app.threadIndex).toBe(0)
  })

  it('remembers a position per workspace', () => {
    app.moveThread(2) // pi-core -> thread 2
    app.goWorkspace(1)
    expect(app.threadIndex).toBe(0)
    app.moveThread(1) // ocarina-ui -> thread 1
    expect(app.threadIndex).toBe(1)

    app.goWorkspace(0)
    expect(app.threadIndex).toBe(2)
    app.goWorkspace(1)
    expect(app.threadIndex).toBe(1)
  })

  it('clamps against the workspace it is switching into', () => {
    app.moveThread(2) // index 2 in a 3-thread workspace
    app.goWorkspace(2) // docs-site has a single thread
    expect(app.threadIndex).toBe(0)
    expect(app.threadLabel).toBe('1/1')
  })

  it('reports the label the chrome renders', () => {
    expect(app.threadLabel).toBe('1/3')
    app.moveThread(1)
    expect(app.threadLabel).toBe('2/3')
  })

  it('drives the strip offset', () => {
    expect(stripOffset(app.threadIndex)).toBe(-390)
    app.moveThread(1)
    expect(stripOffset(app.threadIndex)).toBe(-1192)
  })
})

describe('mode', () => {
  it('accents the chrome only in INSERT and LEADER', () => {
    expect(app.accented).toBe(false)
    app.mode = 'INSERT'
    expect(app.accented).toBe(true)
    app.mode = 'LEADER'
    expect(app.accented).toBe(true)
    app.mode = 'NORMAL'
    expect(app.accented).toBe(false)
  })
})

describe('what a column header calls a thread', () => {
  const placeholder = { id: 'p1', title: 'new thread', status: 'idle' as const, meta: '' }

  it('keeps a real title from the catalog', () => {
    expect(app.titleOf({ ...placeholder, title: 'retry backoff' })).toBe('retry backoff')
  })

  it('uses the thread’s own first message while the title is a placeholder', () => {
    // pi names a session from its first message, but a thread created in this
    // session was listed before it had said anything and the app never
    // re-lists.
    threads.seed('p1', {
      ...EMPTY_THREAD,
      blocks: [{ kind: 'user', id: 'u1', text: 'Add retry with exponential backoff' }],
    })

    expect(app.titleOf(placeholder)).toBe('Add retry with exponential backoff')
  })

  it('takes only the first line, trimmed to what a header holds', () => {
    threads.seed('p2', {
      ...EMPTY_THREAD,
      blocks: [{ kind: 'user', id: 'u1', text: '\n  fix the flaky test  \nand then explain why' }],
    })

    expect(app.titleOf({ ...placeholder, id: 'p2' })).toBe('fix the flaky test')
  })

  it('stays on the placeholder until the thread says something', () => {
    threads.seed('p3', EMPTY_THREAD)

    expect(app.titleOf({ ...placeholder, id: 'p3' })).toBe('new thread')
  })
})
