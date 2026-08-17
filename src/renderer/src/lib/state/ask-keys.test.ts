import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskQuestion, UiEvent } from '../../../../shared/protocol'

const invoke = vi.fn().mockResolvedValue({ ok: true })
vi.mock('../session', () => ({
  session: { invoke: (...args: unknown[]) => invoke(...args), onEvents: () => () => {} },
}))

const { app } = await import('./app.svelte')
const { replayThread } = await import('../thread-reducer')
const { asks } = await import('./ask.svelte')
const { askKeys } = await import('./ask-keys.svelte')
const { catalog } = await import('./catalog.svelte')
const { shell } = await import('./shell.svelte')
const { threads } = await import('./threads.svelte')

const QUESTIONS: AskQuestion[] = [
  {
    id: 'scope',
    kind: 'one',
    prompt: 'How far?',
    choices: [
      { id: 'small', title: 'Just this file' },
      { id: 'wide', title: 'Everywhere' },
    ],
  },
  { id: 'name', kind: 'text', prompt: 'Called what?' },
]

const WORKSPACE = {
  id: 'w1',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  git: null,
  snippet: '/code/pi-core',
  threads: [{ id: 's1', title: 'asking', status: 'idle' as const, meta: '' }],
}

/** The thread as its events would leave it. Seeded rather than streamed: this
 *  is about the keys, not about the subscription. */
let history: UiEvent[] = []

function feed(...events: UiEvent[]): void {
  history = [...history, ...events]
  threads.seed('s1', replayThread(history))
}

function press(key: string, extra: Record<string, unknown> = {}): boolean {
  return shell.handleKey({ key, ...extra } as never)
}

beforeEach(() => {
  invoke.mockClear()
  catalog.workspaces = [structuredClone(WORKSPACE)]
  catalog.source = 'live'
  app.goWorkspace(0)
  app.mode = 'NORMAL'
  history = []
  asks.forget('ask-1')
  asks.forget('ask-2')
  askKeys.forget('s1')
  feed({ kind: 'ask', id: 'ask-1', questions: QUESTIONS })
})

describe('who has the keys', () => {
  it('gives them to a question the moment it arrives', () => {
    expect(askKeys.holding).toBe('ask-1')
    expect(askKeys.focused('s1', 'ask-1')).toBe(true)
  })

  it('takes j and k away from the blocks', () => {
    const flow = asks.flow('ask-1', QUESTIONS)

    expect(press('j')).toBe(true)
    expect(flow.cursor).toBe(1)
    expect(press('k')).toBe(true)
    expect(flow.cursor).toBe(0)
    // The blocks were not walked: a question is not a transcript.
    expect(app.mode).toBe('NORMAL')
  })

  it('hands them back on esc, with the question still pending', () => {
    expect(press('Escape')).toBe(true)

    expect(askKeys.holding).toBeNull()
    expect(askKeys.pendingIn('s1')).toBe('ask-1')
  })

  it('takes them again on enter from NORMAL', () => {
    press('Escape')
    expect(press('Enter')).toBe(true)

    expect(askKeys.holding).toBe('ask-1')
  })

  it('gives them to the next question once the released one is done', () => {
    press('Escape')
    feed({ kind: 'ask', id: 'ask-2', questions: QUESTIONS })

    // Still the older one's turn, and the reader let it go, so nobody holds
    // the keys.
    expect(askKeys.holding).toBeNull()

    feed({ kind: 'ask-answered', id: 'ask-1', outcome: 'answered', answers: [] })
    expect(askKeys.holding).toBe('ask-2')
  })

  it('answers the oldest question first when two are waiting', () => {
    feed({ kind: 'ask', id: 'ask-2', questions: QUESTIONS })

    expect(askKeys.holding).toBe('ask-1')
  })

  it('has nothing to hold once the question is answered', () => {
    feed({ kind: 'ask-answered', id: 'ask-1', outcome: 'answered', answers: [] })

    expect(askKeys.holding).toBeNull()
    expect(press('j')).toBe(true)
  })
})

describe('answering with the keys', () => {
  it('takes the highlighted choice on enter and steps on', () => {
    const flow = asks.flow('ask-1', QUESTIONS)

    press('j')
    press('Enter')

    expect(flow.picked.scope).toEqual(['wide'])
    expect(flow.at).toBe(1)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('types into a text question rather than moving anything', () => {
    const flow = asks.flow('ask-1', QUESTIONS)
    press('Enter')

    expect(flow.typing).toBe(true)
    press('j')
    press('o')
    press(' ')
    press('b')

    expect(flow.typed.name).toBe('jo b')
  })

  it('sends every answer once, on the last enter', () => {
    press('Enter')
    press('a')
    press('Enter')

    expect(invoke).toHaveBeenCalledWith('answerAsk', {
      threadId: 's1',
      askId: 'ask-1',
      answers: [
        { id: 'scope', kind: 'one', chosen: ['small'], labels: ['Just this file'] },
        { id: 'name', kind: 'text', chosen: [], labels: [], text: 'a' },
      ],
    })
  })

  it('steps back on shift-tab', () => {
    const flow = asks.flow('ask-1', QUESTIONS)
    press('Enter')
    expect(flow.at).toBe(1)

    press('Tab', { shiftKey: true })
    expect(flow.at).toBe(0)
  })

  it('swallows a stray key rather than letting it move the column', () => {
    expect(press('l')).toBe(true)
    expect(app.threadIndex).toBe(0)
  })
})
