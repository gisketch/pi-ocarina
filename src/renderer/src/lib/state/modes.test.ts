/** The voice, over a column that has no session behind it.
 *
 *  Unwired, which is the browser harness. That is enough for the question this
 *  answers: whether a placeholder column can be given a voice of its own. It
 *  used to send `setThreadMode` with `fresh:<workspace>`; main stored the
 *  override under that id, returned `{ ok: true }`, and its own refresh threw
 *  into an unhandled rejection nobody caught.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { modes } from './modes.svelte'
import { threadIdForTest } from '../../../../shared/thread-id'

beforeEach(async () => {
  await modes.load(threadIdForTest('t1'))
  await modes.setThread(undefined)
  await modes.setDefault(undefined)
})

describe('a thread of its own', () => {
  it('takes a voice, and reports itself overridden', async () => {
    await modes.load(threadIdForTest('t1'))
    await modes.setThread('terse')

    expect(modes.overridden).toBe(true)
  })
})

describe('a column with no thread behind it', () => {
  it('cannot be given a voice of its own', async () => {
    await modes.load(null)

    await modes.setThread('terse')

    expect(modes.overridden).toBe(false)
  })

  it('still reads the default, which its first message will be born with', async () => {
    await modes.load(threadIdForTest('t1'))
    await modes.setDefault('terse')

    await modes.load(null)

    expect(modes.overridden).toBe(false)
    expect(modes.fallback).toBe('terse')
  })
})
