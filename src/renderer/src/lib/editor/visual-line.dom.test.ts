// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { mountEditor, type EditorHandle } from './editor'

Range.prototype.getClientRects = function () {
  return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as never
}
Range.prototype.getBoundingClientRect = () =>
  ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) as never

let handle: EditorHandle | null = null

function mount(onNotify?: (message: string) => void): {
  host: HTMLElement
  view: EditorView
  press: (key: string) => void
} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  handle = mountEditor(host, {
    text: 'one\ntwo\nthree',
    path: 'sample.txt',
    bag: {
      save: () => Promise.resolve(true),
      quit: () => {},
      quitAll: () => {},
    },
    onNotify,
  })
  const view = EditorView.findFromDOM(host)!
  const content = host.querySelector('.cm-content') as HTMLElement

  return {
    host,
    view,
    press: (key) => {
      content.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  handle?.destroy()
  handle = null
})

describe('the buffer visual treatment', () => {
  it('paints only the existing text on every V-selected row', async () => {
    const { host, view, press } = mount()

    press('V')
    await Promise.resolve()
    expect(view.dom.classList.contains('cm-visual-line-mode')).toBe(true)
    expect(host.querySelectorAll('.cm-visual-line-text')).toHaveLength(1)

    press('j')
    const selection = view.state.selection.main
    const first = view.state.doc.lineAt(selection.from).number
    const last = view.state.doc.lineAt(selection.to - 1).number
    const expected = Array.from(
      { length: last - first + 1 },
      (_, offset) => view.state.doc.line(first + offset).text,
    ).filter(Boolean)
    const marks = [...host.querySelectorAll<HTMLElement>('.cm-visual-line-text')]

    expect(marks.map((mark) => mark.textContent)).toEqual(expected)
    expect(marks.every((mark) => mark.tagName === 'SPAN')).toBe(true)
    expect(getComputedStyle(host.querySelector('.cm-selectionLayer')!).display).toBe('none')
    const markStyle = getComputedStyle(marks[0])
    expect(markStyle.backgroundColor).toContain('var(--bg-column)')
    expect(markStyle.backgroundColor).not.toContain('transparent')
    expect(markStyle.boxShadow).toContain('0 -1px 0')
    expect(markStyle.boxShadow).not.toContain('transparent')
    expect(host.querySelectorAll('.cm-visual-line-current')).toHaveLength(1)
    expect(getComputedStyle(host.querySelector('.cm-visual-line-current')!).fontWeight).toBe('600')
    const activeGutter = host.querySelector('.cm-activeLineGutter')!
    expect(activeGutter.textContent).toBe(String(view.state.doc.lineAt(selection.head).number))
    expect(getComputedStyle(activeGutter).fontWeight).toBe('700')
    expect(getComputedStyle(activeGutter).filter).toBe('brightness(1.16)')

    press('Escape')
    await Promise.resolve()
    expect(view.dom.classList.contains('cm-visual-line-mode')).toBe(false)
    expect(host.querySelectorAll('.cm-visual-line-text')).toHaveLength(0)
  })

  it('keeps characterwise visual mode character-shaped', async () => {
    const { host, view, press } = mount()
    press('v')
    await Promise.resolve()
    expect(view.dom.classList.contains('cm-visual-line-mode')).toBe(false)
    expect(host.querySelectorAll('.cm-visual-line-text')).toHaveLength(0)
  })

  it('forwards Vim notices instead of mounting its notification panel', async () => {
    const messages: string[] = []
    const { host, press } = mount((message) => messages.push(message))

    press('V')
    await Promise.resolve()
    press('j')
    press('y')

    expect(messages).toEqual(['2 lines yanked'])
    expect(host.textContent).not.toContain('lines yanked')
  })

  it('inherits the column surface instead of introducing another background', () => {
    const { view } = mount()
    const style = getComputedStyle(view.dom)
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })
})
