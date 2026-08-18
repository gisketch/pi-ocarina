/** A screen drawn over the strip owns every key it is drawn over.
 *
 *  Two halves, and the bug needed both: the reducer used to let digits and the
 *  transcript keys through from any overlay, and the shell asked the column's
 *  own surfaces — the block menu, the leap hints, a pending question, the agent
 *  peek — before it knew whether a dialog was up. Either one moves something
 *  the reader cannot see, behind the thing they are reading.
 *
 *  The routing seam is mocked because the question here is *whether* those
 *  surfaces are asked at all, not what any one of them would have answered. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const routing = vi.hoisted(() => ({
  routeToOverlay: vi.fn<(event: unknown) => boolean | null>(() => null),
  routeToSurface: vi.fn<(event: unknown, mode: string, threadId: string) => boolean>(() => false),
}))
vi.mock('./key-routing.svelte', () => routing)

import { app } from './app.svelte'
import { catalog } from './catalog.svelte'
import { shell } from './shell.svelte'

const workspace = (id: string, name: string) => ({
  id,
  name,
  note: 'D',
  hue: 152,
  git: null,
  snippet: `/code/${name}`,
  threads: [{ id: `${id}-s1`, title: 'first', status: 'idle' as const, meta: '' }],
})

beforeEach(() => {
  routing.routeToOverlay.mockClear()
  routing.routeToSurface.mockClear()
  catalog.workspaces = [workspace('w1', 'pi-core'), workspace('w2', 'ocarina-ui')]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focus = [0, 0]
  app.mode = 'NORMAL'
  shell.overlay = null
  shell.pendingClose = null
})

describe('a key pressed under an open screen', () => {
  it('reaches the column surfaces only while nothing is drawn over them', () => {
    shell.handleKey({ key: 'j' })
    expect(routing.routeToSurface).toHaveBeenCalledTimes(1)

    shell.openOverlay('settings')
    shell.handleKey({ key: 'j' })

    // A question answered from behind a dialog is answered blind.
    expect(routing.routeToSurface).toHaveBeenCalledTimes(1)
  })

  it('does not walk the transcript behind a screen that has no use for j', () => {
    shell.openOverlay('settings')

    shell.handleKey({ key: 'j' })

    // READ dims the column and moves a ring in it — both invisible under a
    // dialog, and both still there when the dialog closes.
    expect(app.mode).toBe('NORMAL')
  })

  it('does not change workspaces on a digit', () => {
    for (const overlay of ['settings', 'keymap', 'switcher', 'workspace'] as const) {
      shell.openOverlay(overlay)

      shell.handleKey({ key: '2' })

      expect(app.workspaceIndex, `digit moved the strip under ${overlay}`).toBe(0)
      expect(shell.overlay, `digit closed ${overlay}`).toBe(overlay)
    }
  })

  it('still closes the screen on the key that opened it', () => {
    shell.openOverlay('settings')

    shell.handleKey({ key: ',' })

    expect(shell.overlay).toBeNull()
  })
})
