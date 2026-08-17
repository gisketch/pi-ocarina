import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UiEvent } from '../../../../shared/protocol'
import type { AskQuestion } from '../../../../shared/vocabulary'

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
  askKeys.settle('ask-1')
  askKeys.settle('ask-2')
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

    // Once, and only once: a second send would carry a different answer set
    // for a question the reader believes they have already answered.
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('answerAsk', {
      threadId: 's1',
      askId: 'ask-1',
      answers: [
        { id: 'scope', kind: 'one', chosen: ['small'], labels: ['Just this file'] },
        { id: 'name', kind: 'text', chosen: [], labels: [], text: 'a' },
      ],
    })
  })

  it('stops holding the keys the moment the answers are sent', () => {
    press('Enter')
    press('a')
    press('Enter')

    expect(askKeys.holding).toBeNull()
    // A second press in the round-trip window does nothing at all.
    expect(press('Enter')).toBe(false)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('steps back on shift-tab', () => {
    const flow = asks.flow('ask-1', QUESTIONS)
    press('Enter')
    expect(flow.at).toBe(1)

    press('Tab', { shiftKey: true })
    expect(flow.at).toBe(0)
  })

  it('lets a real field have its own keys', () => {
    const flow = asks.flow('ask-1', QUESTIONS)

    // The card's text inputs are real inputs; the browser is already typing
    // into them, and handling the key here would double every character. The
    // cursor stays where it was, whatever the strip does with the key after.
    press('j', { target: { tagName: 'INPUT' } })
    expect(flow.cursor).toBe(0)
    expect(flow.typed).toEqual({})
  })

  it('never takes the caret from the composer', () => {
    const flow = asks.flow('ask-1', QUESTIONS)
    app.mode = 'INSERT'

    // The key belongs to the field the reader is typing in. The card does not
    // consume it, and the cursor does not move.
    expect(press('j')).toBe(false)
    expect(flow.cursor).toBe(0)
  })

  it('swallows a stray key rather than letting it move the column', () => {
    expect(press('l')).toBe(true)
    expect(app.threadIndex).toBe(0)
  })
})

/** A question with a free-text row, which the shared fixture has not got. */
const WITH_OTHER: AskQuestion[] = [
  {
    id: 'where',
    kind: 'many',
    prompt: 'Where?',
    choices: [
      { id: 'dash', title: 'Dashboard' },
      { id: 'logs', title: 'Logs' },
    ],
    allowOther: true,
  },
  { id: 'why', kind: 'one', prompt: 'Why?', choices: [{ id: 'a', title: 'A' }] },
]

function withOther(): ReturnType<typeof asks.flow> {
  history = []
  asks.forget('ask-2')
  askKeys.settle('ask-2')
  askKeys.forget('s1')
  feed({ kind: 'ask', id: 'ask-2', questions: WITH_OTHER })
  return asks.flow('ask-2', WITH_OTHER)
}

describe('moving onto the free-text row', () => {
  it('does not start typing, so the next `k` still moves', () => {
    // The bug: landing on "something else" turned typing on, and `k` was typed
    // into the field instead of moving the cursor up.
    const flow = withOther()
    press('j')
    press('j')
    expect(flow.cursor).toBe(-1)
    expect(flow.typing).toBe(false)

    // Up from the free-text row is the last choice, not the first.
    press('k')
    expect(flow.cursor).toBe(1)
    expect(flow.typed.where ?? '').toBe('')
  })

  it('starts typing on `l`', () => {
    const flow = withOther()
    press('j')
    press('j')
    expect(press('l')).toBe(true)
    expect(flow.typing).toBe(true)
  })

  it('starts typing on `i` too', () => {
    const flow = withOther()
    press('j')
    press('j')
    press('i')
    expect(flow.typing).toBe(true)
  })

  it('types into the field once the caret is in it', () => {
    const flow = withOther()
    press('j')
    press('j')
    press('l')
    press('k')
    expect(flow.typed.where).toBe('k')
  })
})

describe('`h` and `l` while a question holds the keys', () => {
  it('does not change column: `l` advances the question instead', () => {
    // A card holding the keys owns them. `esc` is how a reader leaves.
    const flow = withOther()
    press(' ')
    expect(press('l')).toBe(true)
    expect(flow.at).toBe(1)
  })

  it('steps back on `h`', () => {
    const flow = withOther()
    press(' ')
    press('l')
    expect(flow.at).toBe(1)

    expect(press('h')).toBe(true)
    expect(flow.at).toBe(0)
  })

  it('leaves the workspace digits alone, so a reader is never trapped', () => {
    withOther()
    expect(askKeys.handleKey({ key: '2' })).toBe(false)
  })
})
