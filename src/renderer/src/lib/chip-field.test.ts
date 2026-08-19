// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { caretOffset, caretPosition, chipNode, serialize } from './chip-field'

/** The editor's one invariant: the DOM serializes to exactly the composer
 *  string. Text nodes are text, a chip is its token, a `<br>` is a newline —
 *  and the caret maps both ways on that string, never inside a chip. */

const chip = (token: string, label = token): HTMLElement =>
  chipNode(document, { token, label, icon: 'tool-skill', tone: 'warn' })

const build = (...parts: (string | HTMLElement)[]): HTMLElement => {
  const root = document.createElement('div')
  for (const part of parts) {
    root.append(typeof part === 'string' ? document.createTextNode(part) : part)
  }
  return root
}

describe('serializing the field', () => {
  it('text nodes are text', () => {
    expect(serialize(build('hello there'))).toBe('hello there')
  })

  it('a chip is its token, whatever it displays', () => {
    const root = build('do ', chip('/skill-creator', 'skill-creator'), ' now')
    expect(serialize(root)).toBe('do /skill-creator now')
  })

  it('a chip at the very start and at the very end', () => {
    expect(serialize(build(chip('a.png'), ' ok'))).toBe('a.png ok')
    expect(serialize(build('ok ', chip('a.png')))).toBe('ok a.png')
  })

  it('a newline typed into the field survives', () => {
    expect(serialize(build('one\ntwo'))).toBe('one\ntwo')
  })

  it('a <br> is a newline, except the padding one the browser leaves last', () => {
    const root = build('one')
    root.append(document.createElement('br'), document.createTextNode('two'))
    expect(serialize(root)).toBe('one\ntwo')

    const padded = build('one')
    padded.append(document.createElement('br'))
    expect(serialize(padded)).toBe('one')
  })

  it('an empty field is the empty string', () => {
    expect(serialize(build())).toBe('')
    const lone = build()
    lone.append(document.createElement('br'))
    expect(serialize(lone)).toBe('')
  })
})

describe('where the caret is, on the serialized string', () => {
  it('inside a text node', () => {
    const root = build('hello')
    expect(caretOffset(root, root.firstChild!, 3)).toBe(3)
  })

  it('after a chip, counting the chip as its token', () => {
    const root = build('do ', chip('/skill-creator'), ' now')
    const tail = root.childNodes[2]
    // 'do ' (3) + token (14) + 1 into ' now'.
    expect(caretOffset(root, tail, 1)).toBe(18)
  })

  it('an element position between children', () => {
    const root = build('do ', chip('/skill-creator'), ' now')
    expect(caretOffset(root, root, 1)).toBe(3)
    expect(caretOffset(root, root, 2)).toBe(17)
  })
})

describe('placing the caret by index', () => {
  it('lands in the right text node', () => {
    const root = build('do ', chip('/skill-creator'), ' now')
    expect(caretPosition(root, 2)).toEqual({ node: root.firstChild, offset: 2 })
    expect(caretPosition(root, 18)).toEqual({ node: root.childNodes[2], offset: 1 })
  })

  it('an index inside a chip token clamps past the chip — never inside it', () => {
    const root = build('do ', chip('/skill-creator'), ' now')
    // Index 10 is mid-token. The chip is atomic; the caret goes after it.
    expect(caretPosition(root, 10)).toEqual({ node: root, offset: 2 })
  })

  it('the end of the string is the end of the field', () => {
    const root = build('ok ', chip('a.png'))
    expect(caretPosition(root, 8)).toEqual({ node: root, offset: 2 })
  })

  it('round-trips: position then offset gives the index back, outside chips', () => {
    const root = build('a ', chip('b.png'), ' c\nd')
    for (const index of [0, 1, 2, 7, 8, 9, 10, 11]) {
      const at = caretPosition(root, index)
      expect(caretOffset(root, at.node, at.offset)).toBe(index)
    }
  })
})
