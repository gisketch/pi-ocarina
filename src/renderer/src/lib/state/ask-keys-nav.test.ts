/** The keys a question owns, and the ones it deliberately does not.
 *
 *  Split from `ask-keys.test.ts`, which is about who holds them. These are the
 *  behaviours a real session found: a cursor that typed, `h`/`l` falling
 *  through to the columns, and `l` sending an answer nobody chose. */

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

/** A one-question ask, on its own — the ordinary shape, and the one where a
 *  key that submits is most dangerous. */
function lone(): void {
  history = []
  asks.forget('ask-2')
  askKeys.settle('ask-2')
  askKeys.forget('s1')
  feed({ kind: 'ask', id: 'ask-2', questions: [QUESTIONS[0]] })
  invoke.mockClear()
}

describe('what `l` will not do', () => {
  it('never sends, however many times it is pressed', () => {
    // `l` is the shell's next-column reflex. On a one-question ask a habitual
    // press would have handed the model whatever the cursor was on.
    lone()

    press('l')
    press('l')
    press('l')
    expect(invoke).not.toHaveBeenCalledWith('answerAsk', expect.anything())
  })

  it('leaves sending to enter, which the card’s own legend names', () => {
    lone()

    press(' ')
    press('Enter')
    expect(invoke).toHaveBeenCalledWith('answerAsk', expect.anything())
  })
})

describe('an empty free-text row does not lock the question', () => {
  it('gives its pick back when the reader moves off it with nothing typed', () => {
    // `ready` demands text once OTHER is picked, so keeping the pick made a
    // `many` question unanswerable behind text nobody typed.
    const flow = withOther()
    press('j')
    press('j')
    press('l')
    press('Escape')
    press('k')

    expect(flow.picked.where ?? []).not.toContain('other')
    press(' ')
    expect(flow.ready).toBe(true)
  })
})
