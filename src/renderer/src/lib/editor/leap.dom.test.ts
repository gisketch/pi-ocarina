// @vitest-environment jsdom
/** Leap against a real mounted editor: the DOM-level contract — vim gets the
 *  keys leap declines, leap gets the keys vim never sees. jsdom has no
 *  layout, so geometry (scrolling, label pixels) stays with the live pass;
 *  what this pins is the key routing and the jump itself. */

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { vim, getCM } from '@replit/codemirror-vim'
import { leapExtension } from './leap'

// CM measures through APIs jsdom does not implement.
Range.prototype.getClientRects = function () {
  return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as never
}
Range.prototype.getBoundingClientRect = () =>
  ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) as never

let view: EditorView

function mount(doc: string): EditorView {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, extensions: [vim(), leapExtension()] }),
  })
  return view
}

function press(key: string): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  )
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  view.destroy()
})

describe('leap in a mounted editor', () => {
  it('vim is alive at all: l moves the cursor right', () => {
    mount('alpha beta')
    expect(getCM(view)).not.toBeNull()
    press('l')
    expect(view.state.selection.main.head).toBe(1)
  })

  it('s, two characters, one match: jumps without asking', () => {
    mount('alpha beta')
    press('s')
    press('b')
    press('e')
    expect(view.state.selection.main.head).toBe(6)
  })

  it('two matches: labels, and the label key lands the far one', () => {
    mount('alpha beta and beta again')
    press('s')
    press('b')
    press('e')
    // Two hits, so no auto-jump yet.
    expect(view.state.selection.main.head).toBe(0)
    // j names the nearest (6), f the next (15).
    press('f')
    expect(view.state.selection.main.head).toBe(15)
  })

  it('announces LEAP, dims the buffer, highlights matches, and overlays labels', () => {
    const active: boolean[] = []
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: 'alpha beta and beta again',
        extensions: [vim(), leapExtension((now) => active.push(now))],
      }),
    })

    press('s')
    expect(active).toEqual([true])
    expect(view.dom.classList.contains('cm-leaping')).toBe(true)

    press('b')
    press('e')
    expect(view.dom.querySelectorAll('.cm-leap-hit')).toHaveLength(2)
    const labels = view.dom.querySelectorAll<HTMLElement>('.cm-leap-label')
    expect(labels).toHaveLength(2)
    expect(labels[0]?.firstElementChild?.textContent).toBe('j')
    expect(getComputedStyle(labels[0]!).width).toBe('0px')
    expect(getComputedStyle(labels[0]!.firstElementChild!).position).toBe('absolute')
    expect(view.state.doc.toString()).toBe('alpha beta and beta again')

    press('Escape')
    expect(active).toEqual([true, false])
    expect(view.dom.classList.contains('cm-leaping')).toBe(false)
  })

  it('escape cancels a leap and stays put', () => {
    mount('alpha beta and beta again')
    press('s')
    press('b')
    press('e')
    press('Escape')
    expect(view.state.selection.main.head).toBe(0)
  })

  it('works through mountEditor, the column\'s own path', async () => {
    const { mountEditor } = await import('./editor')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const modes: string[] = []
    const handle = mountEditor(host, {
      text: 'alpha beta',
      path: 'a.txt',
      bag: {
        save: () => Promise.resolve(true),
        quit: () => {},
        quitAll: () => {},
      },
      onModeChange: (mode) => modes.push(mode),
    })
    const inner = host.querySelector('.cm-content') as HTMLElement
    const hit = (key: string): void => {
      inner.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }
    hit('s')
    expect(modes.at(-1)).toBe('leap')
    hit('b')
    hit('e')
    expect(modes.at(-1)).toBe('normal')
    const mounted = EditorView.findFromDOM(host)
    expect(mounted?.state.selection.main.head).toBe(6)

    // The strip's way in: enterLeap arms a session without an s keypress.
    mounted?.dispatch({ selection: { anchor: 0 } })
    handle.enterLeap()
    expect(modes.at(-1)).toBe('leap')
    hit('b')
    hit('e')
    expect(modes.at(-1)).toBe('normal')
    expect(mounted?.state.selection.main.head).toBe(6)
    handle.destroy()
  })

  it('a pending count keeps s away from leap', () => {
    mount('xy xy xy')
    press('2')
    press('s')
    // 2s is vim's substitute-two, not a leap: the session must not start,
    // so the next keys are vim's too.
    press('Escape')
    expect(view.state.doc.toString()).not.toBe('xy xy xy')
  })
})
