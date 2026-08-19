import { describe, expect, it } from 'vitest'
import type { Workspace } from './types'
import { movePane, visualColumns } from './pane-layout'

function workspace(): Workspace {
  return {
    id: 'w1', name: 'one', note: 'D', hue: 150, git: null, snippet: '',
    threads: [
      { id: 'a', title: 'a', status: 'idle', meta: '' },
      { id: 'b', title: 'b', status: 'idle', meta: '' },
      { id: 'c', title: 'c', status: 'idle', meta: '' },
      {
        id: 'term-a', title: 'zsh', status: 'idle', meta: '', terminal: true,
        attachment: { kind: 'terminal', hostId: 'a', side: 'right' },
      },
    ],
  }
}

describe('pane visual order', () => {
  it('places an attachment on the side named by its host relation', () => {
    expect(visualColumns(workspace()).map((column) => column.id)).toEqual(['a', 'term-a', 'b', 'c'])
    const left = movePane(workspace(), 'term-a', -1)
    expect(visualColumns(left).map((column) => column.id)).toEqual(['term-a', 'a', 'b', 'c'])
  })

  it('crosses the host, then magnetises to the adjacent host', () => {
    const left = movePane(workspace(), 'term-a', -1)
    const blockedAtEdge = movePane(left, 'term-a', -1)
    expect(blockedAtEdge).toBe(left)

    const rightAgain = movePane(left, 'term-a', 1)
    const nextHost = movePane(rightAgain, 'term-a', 1)
    expect(nextHost.threads.find((column) => column.id === 'term-a')?.attachment).toMatchObject({
      hostId: 'b', side: 'left',
    })
  })

  it('blocks a move into an occupied host', () => {
    const occupied = workspace()
    occupied.threads.push({
      id: 'term-b', title: 'zsh', status: 'idle', meta: '', terminal: true,
      attachment: { kind: 'terminal', hostId: 'b', side: 'right' },
    })
    const moved = movePane(occupied, 'term-a', 1)
    expect(movePane(moved, 'term-a', 1)).toBe(moved)
  })

  it('moves a host and carries its attachment relation unchanged', () => {
    const moved = movePane(workspace(), 'a', 1)
    expect(visualColumns(moved).map((column) => column.id)).toEqual(['b', 'a', 'term-a', 'c'])
    expect(moved.threads.find((column) => column.id === 'term-a')?.attachment?.hostId).toBe('a')
  })
})
