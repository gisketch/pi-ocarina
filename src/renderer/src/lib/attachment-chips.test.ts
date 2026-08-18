import { describe, expect, it } from 'vitest'
import { markAttachments, unnamedIn } from './attachment-chips'
import { parseInline } from './markdown-inline'
import type { MessageAttachment } from './thread'

const file = (name: string): MessageAttachment => ({ name })
const rejoin = (segments: { text: string }[]): string => segments.map((one) => one.text).join('')

describe('marking an attached file where the message names it', () => {
  it('splits the run around the name', () => {
    const marked = markAttachments(parseInline('In before.png the palette clips'), [
      file('before.png'),
    ])

    expect(marked.map((one) => one.attachment)).toEqual([undefined, 'before.png', undefined])
  })

  it('marks every attachment in one sentence', () => {
    const marked = markAttachments(parseInline('before.png and after.png differ'), [
      file('before.png'),
      file('after.png'),
    ])

    expect(marked.filter((one) => one.attachment).map((one) => one.text)).toEqual([
      'before.png',
      'after.png',
    ])
  })

  it('prefers the longer name, so one is not swallowed by the other', () => {
    const marked = markAttachments(parseInline('see report.old.png'), [
      file('report.old'),
      file('report.old.png'),
    ])

    expect(marked.find((one) => one.attachment)?.text).toBe('report.old.png')
  })

  it('leaves a quoted path alone — it is being quoted, not referred to', () => {
    const marked = markAttachments(parseInline('run `before.png` through it'), [file('before.png')])
    expect(marked.some((one) => one.attachment)).toBe(false)
  })

  it('leaves a link alone rather than taking its destination with it', () => {
    const marked = markAttachments(parseInline('[before.png](https://x.test/a)'), [
      file('before.png'),
    ])
    expect(marked.some((one) => one.attachment)).toBe(false)
  })

  it('changes nothing when the message carried no files', () => {
    const plain = parseInline('nothing attached here')
    expect(markAttachments(plain)).toEqual(plain)
  })

  it('reproduces the text exactly, whatever it marked', () => {
    for (const text of ['before.png', 'a before.png b', 'before.pngbefore.png', 'none']) {
      expect(rejoin(markAttachments(parseInline(text), [file('before.png')]))).toBe(text)
    }
  })
})

describe('the files the message never named', () => {
  it('are the ones still to be drawn after the text', () => {
    expect(unnamedIn('look at before.png', [file('before.png'), file('trace.log')])).toEqual([
      file('trace.log'),
    ])
  })

  it('is empty when the message named all of them', () => {
    expect(unnamedIn('before.png', [file('before.png')])).toEqual([])
  })
})
