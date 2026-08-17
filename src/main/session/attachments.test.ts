import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AttachmentRef } from '../../shared/vocabulary'
import { describeAttachments, readImages } from './attachments'

async function imageFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'piocarina-att-'))
  const path = join(dir, 'shot.png')
  await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  return path
}

const log: AttachmentRef = { name: 'trace.log', path: '/tmp/trace.log', mime: 'text/plain' }

describe('readImages', () => {
  it('reads an image into the base64 pi expects', async () => {
    const path = await imageFile()
    const [image] = await readImages([{ name: 'shot.png', path, mime: 'image/png' }])

    expect(image).toMatchObject({ type: 'image', mimeType: 'image/png' })
    expect(Buffer.from(image.data, 'base64')).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })

  it('ignores files that are not images', async () => {
    expect(await readImages([log])).toEqual([])
  })

  it('drops an image it cannot read rather than failing the turn', async () => {
    // Losing a whole prompt over one unreadable file would be worse.
    const missing: AttachmentRef = { name: 'gone.png', path: '/no/such.png', mime: 'image/png' }
    expect(await readImages([missing])).toEqual([])
  })

  it('sends the rest when one of several cannot be read', async () => {
    const path = await imageFile()
    const images = await readImages([
      { name: 'gone.png', path: '/no/such.png', mime: 'image/png' },
      { name: 'shot.png', path, mime: 'image/png' },
    ])

    expect(images).toHaveLength(1)
  })
})

describe('describeAttachments', () => {
  it('names files pi cannot take as attachments', () => {
    // pi accepts text and images only, so a log can only be named for it to
    // open. Saying so is honest; dropping it silently is not.
    expect(describeAttachments([log])).toContain('/tmp/trace.log')
  })

  it('names an image, because its bytes carry no name', () => {
    // An image travels as bytes, so nothing else in the message says it was
    // there — the model could not refer to it, and the sent message, which is
    // only this text, showed the reader no trace of what they attached.
    const said = describeAttachments([{ name: 'shot.png', path: '/a/shot.png', mime: 'image/png' }])

    expect(said).toContain('shot.png')
    // The name, not the path: main read the bytes, so nothing should open it.
    expect(said).not.toContain('/a/shot.png')
  })

  it('names images and files separately, because they arrive differently', () => {
    const said = describeAttachments([
      { name: 'shot.png', path: '/a/shot.png', mime: 'image/png' },
      log,
    ])

    expect(said).toContain('Images attached: shot.png')
    expect(said).toContain('/tmp/trace.log')
  })

  it('says nothing when there are no attachments', () => {
    expect(describeAttachments([])).toBe('')
  })

  it('names every non-image file', () => {
    const text = describeAttachments([log, { name: 'p.patch', path: '/p.patch' }])
    expect(text).toContain('/tmp/trace.log')
    expect(text).toContain('/p.patch')
  })
})
