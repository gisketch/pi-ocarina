import { beforeEach, describe, expect, it } from 'vitest'
import type { AskQuestion } from '../../../../shared/vocabulary'
import { asks, OTHER } from './ask.svelte'

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
  {
    id: 'where',
    kind: 'many',
    prompt: 'Where should it show?',
    choices: [
      { id: 'dash', title: 'Dashboard' },
      { id: 'logs', title: 'Logs' },
    ],
    allowOther: true,
  },
  { id: 'name', kind: 'text', prompt: 'Called what?', optional: true },
]

let flow: ReturnType<typeof asks.flow>
let seq = 0

beforeEach(() => {
  seq += 1
  flow = asks.flow(`ask-${seq}`, QUESTIONS)
})

describe('walking the questions', () => {
  it('starts on the first choice of the first question', () => {
    expect(flow.at).toBe(0)
    expect(flow.cursor).toBe(0)
    expect(flow.typing).toBe(false)
    expect(flow.ready).toBe(false)
  })

  it('moves the cursor without running off either end', () => {
    flow.move(-1)
    expect(flow.cursor).toBe(0)
    flow.move(1)
    expect(flow.cursor).toBe(1)
    flow.move(1)
    expect(flow.cursor).toBe(1)
  })

  it('picks one, and replaces it rather than adding', () => {
    flow.toggle()
    expect(flow.picked.scope).toEqual(['small'])
    expect(flow.ready).toBe(true)

    flow.move(1)
    flow.toggle()
    expect(flow.picked.scope).toEqual(['wide'])
  })

  it('takes several on a many question', () => {
    flow.step(1)
    flow.toggle()
    flow.move(1)
    flow.toggle()

    expect(flow.picked.where).toEqual(['dash', 'logs'])

    flow.toggle()
    expect(flow.picked.where).toEqual(['dash'])
  })

  it('puts the free-text row after the choices', () => {
    flow.step(1)
    flow.move(1)
    expect(flow.cursor).toBe(1)
    flow.move(1)
    expect(flow.cursor).toBe(-1)
  })

  it('does not start typing just because the cursor landed on the field', () => {
    // It used to, and the next `k` was typed into the field instead of moving
    // up: the reader was put into a mode they never asked for.
    flow.step(1)
    flow.move(1)
    flow.move(1)
    expect(flow.cursor).toBe(-1)
    expect(flow.typing).toBe(false)
  })

  it('starts typing on `l` or `i`, and only where there is a field', () => {
    flow.step(1)
    expect(flow.startTyping()).toBe(false)
    expect(flow.typing).toBe(false)

    flow.move(1)
    flow.move(1)
    expect(flow.startTyping()).toBe(true)
    expect(flow.typing).toBe(true)
  })

  it('takes the free-text row as picked when the caret goes in', () => {
    flow.step(1)
    flow.move(1)
    flow.move(1)
    flow.startTyping()
    expect(flow.picked[flow.question!.id]).toContain('other')
  })

  it('lands in the field on a text question', () => {
    flow.step(2)
    expect(flow.typing).toBe(true)
    expect(flow.rows).toBe(0)
  })
})

describe('what makes a question answerable', () => {
  it('needs a choice', () => {
    expect(flow.ready).toBe(false)
    flow.toggle()
    expect(flow.ready).toBe(true)
  })

  it('needs the text when the reader went off-menu', () => {
    flow.step(1)
    flow.other()

    expect(flow.picked.where).toContain(OTHER)
    expect(flow.ready).toBe(false)

    flow.type('a')
    expect(flow.ready).toBe(true)
  })

  it('lets an optional question through empty', () => {
    flow.step(2)
    expect(flow.ready).toBe(true)
  })
})

describe('the answers', () => {
  it('carry ids and labels, and text where there is text', () => {
    flow.toggle()
    flow.step(1)
    flow.toggle()
    flow.step(2)
    flow.type('m')
    flow.type('e')

    expect(flow.answers()).toEqual([
      { id: 'scope', kind: 'one', chosen: ['small'], labels: ['Just this file'] },
      { id: 'where', kind: 'many', chosen: ['dash'], labels: ['Dashboard'] },
      { id: 'name', kind: 'text', chosen: [], labels: [], text: 'me' },
    ])
  })

  it('say that an off-menu answer went off the menu, and what it said', () => {
    flow.step(1)
    flow.other()
    flow.write('the #sync channel')

    expect(flow.answers()[1]).toEqual({
      id: 'where',
      kind: 'many',
      chosen: [OTHER],
      labels: [OTHER],
      text: 'the #sync channel',
    })
  })

  it('write a skipped question out rather than leaving it absent', () => {
    flow.toggle()

    const answers = flow.answers()
    expect(answers).toHaveLength(3)
    expect(answers[1]).toMatchObject({ id: 'where', skipped: true })
    expect(answers[2]).toMatchObject({ id: 'name', skipped: true })
  })

  it('drop whitespace-only text', () => {
    flow.step(2)
    flow.write('   ')

    expect(flow.answers()[2]).toMatchObject({ skipped: true })
  })
})

describe('the flows themselves', () => {
  it('keep their place for the same ask, and are separate per ask', () => {
    flow.toggle()
    expect(asks.flow('ask-' + seq, QUESTIONS).picked.scope).toEqual(['small'])

    const other = asks.flow('ask-other', QUESTIONS)
    expect(other.picked.scope).toBeUndefined()
  })

  it('are dropped when the card is done with', () => {
    flow.toggle()
    asks.forget(`ask-${seq}`)

    expect(asks.flow(`ask-${seq}`, QUESTIONS).picked.scope).toBeUndefined()
  })
})
