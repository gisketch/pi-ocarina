import { beforeEach, describe, expect, it } from 'vitest'
import { app } from './app.svelte'
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
