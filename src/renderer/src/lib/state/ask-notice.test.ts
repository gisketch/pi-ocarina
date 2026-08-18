import type { ThreadId } from '../../../../shared/thread-id'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UiEvent } from '../../../../shared/protocol'
import type { AskQuestion } from '../../../../shared/vocabulary'

const revealed = vi.fn()
vi.mock('./block-focus.svelte', () => ({
  revealBlock: (...args: unknown[]) => revealed(...args),
}))

const rest = vi.fn(() => 0)
const body = vi.fn<() => HTMLElement | undefined>(() => ({}) as HTMLElement)
vi.mock('./columns', () => ({
  columnBody: () => body(),
  scrollRest: () => rest(),
}))

vi.mock('../session', () => ({
  session: { invoke: vi.fn().mockResolvedValue({ ok: true }), onEvents: () => () => {} },
}))

const { app } = await import('./app.svelte')
const { askNotice } = await import('./ask-notice.svelte')
const { catalog } = await import('./catalog.svelte')
const { replayThread } = await import('../thread-reducer')
const { applyAskEffects, threads } = await import('./threads.svelte')
const { toasts } = await import('./toasts.svelte')

const QUESTIONS: AskQuestion[] = [{ id: 'q', kind: 'text', prompt: 'when?' }]

const WORKSPACES = [
  {
    id: 'w1',
    name: 'pi-core',
    note: 'D',
    hue: 152,
    git: null,
    snippet: '/code/pi-core',
    threads: [
      { id: 's1', title: 'first', status: 'idle' as const, meta: '' },
      { id: 's2', title: 'second', status: 'idle' as const, meta: '' },
    ],
  },
  {
    id: 'w2',
    name: 'other',
    note: 'F',
    hue: 20,
    git: null,
    snippet: '/code/other',
    threads: [{ id: 's3', title: 'elsewhere', status: 'idle' as const, meta: '' }],
  },
]

function ask(threadId: string, askId = 'ask-1'): void {
  const events: UiEvent[] = [{ kind: 'ask', id: askId, questions: QUESTIONS }]
  threads.seed(threadId, replayThread(events))
  askNotice.arrived(threadId as ThreadId, askId)
}

beforeEach(() => {
  revealed.mockClear()
  rest.mockReturnValue(0)
  body.mockReturnValue({} as HTMLElement)
  toasts.reset()
  catalog.workspaces = structuredClone(WORKSPACES)
  catalog.source = 'live'
  app.goWorkspace(0)
  app.focusThread(0)
  for (const id of ['s1', 's2', 's3']) {
    threads.seed(id, replayThread([]))
    askNotice.settled(id)
  }
})

describe('where the reader is standing', () => {
  it('reveals the question when they are following the thread', () => {
    ask('s1')

    expect(revealed).toHaveBeenCalledWith('s1', 'ask-1', 'nearest')
    expect(askNotice.belowIn('s1')).toBe(false)
    // No toast about the column they are looking at.
    expect(toasts.items).toEqual([])
  })

  it('moves nothing when they are reading back through it', () => {
    rest.mockReturnValue(900)

    ask('s1')

    expect(revealed).not.toHaveBeenCalled()
    expect(askNotice.belowIn('s1')).toBe(true)
  })

  it('moves nothing in another column, and says so with a toast', () => {
    ask('s2')

    expect(revealed).not.toHaveBeenCalled()
    expect(askNotice.belowIn('s2')).toBe(false)
    expect(toasts.items[0]).toMatchObject({
      label: 'view',
      jump: { workspaceId: 'w1', threadId: 's2' },
    })
  })

  it('never switches workspace, and marks the rail instead', () => {
    ask('s3')

    expect(app.workspace.id).toBe('w1')
    expect(askNotice.asking('w2')).toBe(true)
    expect(toasts.items[0]?.jump).toMatchObject({ workspaceId: 'w2', threadId: 's3' })
  })
})

describe('the bar at the bottom edge', () => {
  it('goes when the reader has been taken to the question', () => {
    rest.mockReturnValue(900)
    ask('s1')

    askNotice.seen('s1')

    expect(askNotice.belowIn('s1')).toBe(false)
  })

  it('goes when the question does', () => {
    rest.mockReturnValue(900)
    ask('s1')

    threads.seed(
      's1',
      replayThread([
        { kind: 'ask', id: 'ask-1', questions: QUESTIONS },
        { kind: 'ask-answered', id: 'ask-1', outcome: 'answered', answers: [] },
      ]),
    )

    // Nothing is pending, so nothing is below — even before `settled` is told.
    expect(askNotice.belowIn('s1')).toBe(false)
    expect(askNotice.asking('w1')).toBe(false)
  })
})

describe('the flow behind a card', () => {
  it('is dropped when the card ends, however it ended', async () => {
    const { asks } = await import('./ask.svelte')
    ask('s1')
    asks.flow('ask-1', QUESTIONS).write('half a thought')

    applyAskEffects('s1' as ThreadId, [
      { kind: 'ask-answered', id: 'ask-1', outcome: 'cancelled', answers: [], said: 'no' },
    ])

    expect(asks.flow('ask-1', QUESTIONS).typed).toEqual({})
  })
})
