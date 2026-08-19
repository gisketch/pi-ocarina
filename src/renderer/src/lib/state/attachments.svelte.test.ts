import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachments } from './attachments.svelte'

vi.mock('../bridge', () => ({ bridge: null }))

/** Distinct paths per file, the way two folders give two `notes.md`. Staging
 *  dedupes by path, which is what makes them two files rather than one. */
const stage = (...names: string[]): void => {
  attachments.clear()
  names.forEach((name, i) => attachments.push({ name, path: `/staged/${i}/${name}` }))
}

beforeEach(() => attachments.clear())

describe('unstaging by deleting the chip', () => {
  it('drops a file whose name is gone', () => {
    stage('shot.png')
    attachments.prune('nothing here')

    expect(attachments.names).toEqual([])
  })

  it('keeps a file whose name is still there', () => {
    stage('shot.png')
    attachments.prune('look at shot.png please')

    expect(attachments.names).toEqual(['shot.png'])
  })

  it('does not let one name shelter another it happens to contain', () => {
    // `screenshot.png` contains `shot.png`. A plain `includes` kept the file
    // staged with no chip on screen saying so — and it still travelled with
    // the prompt.
    stage('shot.png', 'screenshot.png')
    attachments.prune('only screenshot.png remains')

    expect(attachments.names).toEqual(['screenshot.png'])
  })

  it('unstages one of two files that share a name', () => {
    stage('notes.md', 'notes.md')
    attachments.prune('just notes.md now')

    expect(attachments.names).toEqual(['notes.md'])
  })

  it('keeps both when both names are there', () => {
    stage('notes.md', 'notes.md')
    attachments.prune('notes.md and notes.md')

    expect(attachments.names).toEqual(['notes.md', 'notes.md'])
  })

  it('leaves the staging order alone', () => {
    stage('a.png', 'bb.png', 'ccc.png')
    attachments.prune('ccc.png a.png bb.png')

    expect(attachments.names).toEqual(['a.png', 'bb.png', 'ccc.png'])
  })
})

