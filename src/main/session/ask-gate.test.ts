import { describe, expect, it } from 'vitest'
import type { UiEvent } from '../../shared/protocol'
import type { AskQuestion } from '../../shared/vocabulary'
import { AskGate, faultIn } from './ask-gate'
import { askUserTool } from './ask-tool'

const ONE: AskQuestion = {
  id: 'scope',
  kind: 'one',
  prompt: 'How far?',
  choices: [
    { id: 'small', title: 'Just this file' },
    { id: 'wide', title: 'Everywhere', description: 'Slower, and touches more.' },
  ],
}

function gate(): { asks: AskGate; events: { threadId: string; event: UiEvent }[] } {
  const events: { threadId: string; event: UiEvent }[] = []
  return { asks: new AskGate((threadId, event) => events.push({ threadId, event })), events }
}

describe('asking', () => {
  it('publishes the questions and waits', async () => {
    const { asks, events } = gate()
    let settled = false

    const waiting = asks.ask('t1', [ONE]).then((result) => {
      settled = true
      return result
    })

    expect(events[0]).toMatchObject({ threadId: 't1', event: { kind: 'ask', questions: [ONE] } })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(asks.pendingFor('t1')).toBe(true)

    const askId = (events[0].event as { id: string }).id
    asks.answer('t1', askId, [{ id: 'scope', kind: 'one', chosen: ['wide'], labels: ['Everywhere'] }])

    expect((await waiting).answers[0].chosen).toEqual(['wide'])
    expect(asks.pendingFor('t1')).toBe(false)
  })

  it('records the answer for the transcript', async () => {
    const { asks, events } = gate()
    void asks.ask('t1', [ONE])
    const askId = (events[0].event as { id: string }).id

    asks.answer('t1', askId, [{ id: 'scope', kind: 'one', chosen: ['small'], labels: ['Just this file'] }])

    expect(events[1].event).toMatchObject({ kind: 'ask-answered', id: askId, outcome: 'answered' })
  })

  it('ignores an answer to a question nobody is waiting on', () => {
    const { asks, events } = gate()

    asks.answer('t1', 'ask-ghost', [])

    expect(events).toEqual([])
  })
})

describe('the ways it ends without an answer', () => {
  it('prose in the composer cancels it, carrying what was said', async () => {
    const { asks, events } = gate()
    const waiting = asks.ask('t1', [ONE])

    asks.cancel('t1', 'neither — do the other thing')

    const result = await waiting
    expect(result).toMatchObject({ cancelled: true, said: 'neither — do the other thing' })
    expect(events[1].event).toMatchObject({ outcome: 'cancelled', said: 'neither — do the other thing' })
  })

  it('the turn ending resolves rather than throwing', async () => {
    const { asks, events } = gate()
    const waiting = asks.ask('t1', [ONE])

    asks.end('t1', 'thread closed')

    await expect(waiting).resolves.toMatchObject({ cancelled: true, reason: 'thread closed' })
    expect(events[1].event).toMatchObject({ outcome: 'ended', reason: 'thread closed' })
  })

  it('leaves other threads alone', async () => {
    const { asks } = gate()
    const mine = asks.ask('t1', [ONE])
    void asks.ask('t2', [ONE])

    asks.end('t1', 'thread closed')

    await mine
    expect(asks.pendingFor('t2')).toBe(true)
  })
})

describe('faultIn', () => {
  it('accepts a real call', () => {
    expect(faultIn([ONE, { id: 'name', kind: 'text', prompt: 'called what?' }])).toBeNull()
  })

  it('names what is wrong, so the model can fix it', () => {
    expect(faultIn([])).toMatch(/at least one question/)
    expect(faultIn([{ kind: 'one', prompt: '?' }])).toMatch(/needs an id/)
    expect(faultIn([ONE, ONE])).toMatch(/share the id/)
    expect(faultIn([{ id: 'a', kind: 'one', prompt: '' }])).toMatch(/no prompt/)
    expect(faultIn([{ id: 'a', kind: 'radio', prompt: '?' }])).toMatch(/unknown kind/)
    expect(faultIn([{ id: 'a', kind: 'one', prompt: '?' }])).toMatch(/no choices/)
    expect(
      faultIn([{ id: 'a', kind: 'many', prompt: '?', choices: [{ id: 'x' }] }]),
    ).toMatch(/no title/)
    expect(
      faultIn([
        { id: 'a', kind: 'one', prompt: '?', choices: [{ id: 'x', title: 'X' }, { id: 'x', title: 'Y' }] },
      ]),
    ).toMatch(/share the id/)
  })
})

describe('the tool', () => {
  const tool = (asks: AskGate) => askUserTool(asks, { threadId: 't1' })

  it('blocks until the question is answered, then hands back JSON', async () => {
    const { asks, events } = gate()
    const running = tool(asks).execute('call-1', { questions: [ONE] }, undefined)

    await Promise.resolve()
    const askId = (events[0].event as { id: string }).id
    asks.answer('t1', askId, [{ id: 'scope', kind: 'one', chosen: ['wide'], labels: ['Everywhere'] }])

    const result = await running
    expect(JSON.parse(result.content[0].text)).toEqual({
      answers: [{ id: 'scope', kind: 'one', chosen: ['wide'], labels: ['Everywhere'] }],
    })
  })

  it('answers a malformed call instead of throwing', async () => {
    const { asks, events } = gate()

    const result = await tool(asks).execute('call-1', { questions: [] }, undefined)

    expect(JSON.parse(result.content[0].text).error).toMatch(/at least one question/)
    expect(events).toEqual([])
  })

  it('lets go when the turn is aborted', async () => {
    const { asks } = gate()
    const control = new AbortController()

    const running = tool(asks).execute('call-1', { questions: [ONE] }, control.signal)
    await Promise.resolve()
    control.abort()

    const result = await running
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      cancelled: true,
      reason: 'turn cancelled',
    })
    expect(asks.pendingFor('t1')).toBe(false)
  })

  it('describes itself to the model', () => {
    const { asks } = gate()
    const definition = tool(asks)

    expect(definition.name).toBe('ask_user')
    // Both halves: when to ask, and when not to.
    expect(definition.description).toMatch(/Ask whenever/)
    expect(definition.description).toMatch(/Do not ask/)
    // And the guideline that makes it reach for the tool rather than writing
    // the question into its reply, which is what the live pass found.
    expect(definition.promptGuidelines?.[0]).toMatch(/Never end a reply with a question/)
  })
})

describe('two questions in one thread', () => {
  it('are released together when the turn ends', async () => {
    const { asks } = gate()
    const first = asks.ask('t1', [ONE])
    const second = asks.ask('t1', [ONE])

    asks.end('t1', 'thread closed')

    await expect(first).resolves.toMatchObject({ reason: 'thread closed' })
    await expect(second).resolves.toMatchObject({ reason: 'thread closed' })
    expect(asks.pendingCount).toBe(0)
  })

  it('are both cancelled by one message', async () => {
    const { asks } = gate()
    const first = asks.ask('t1', [ONE])
    const second = asks.ask('t1', [ONE])

    asks.cancel('t1', 'do the other thing')

    await expect(first).resolves.toMatchObject({ said: 'do the other thing' })
    await expect(second).resolves.toMatchObject({ said: 'do the other thing' })
  })
})
