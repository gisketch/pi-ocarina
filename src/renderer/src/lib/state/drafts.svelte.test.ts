// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { flushSync } from 'svelte'
import { drafts } from './drafts.svelte'

describe('drafts', () => {
  it('remembers per column, and forgets a closed one', () => {
    drafts.set('col-a', 'half a message')
    expect(drafts.get('col-a')).toBe('half a message')

    drafts.forget('col-a')
    expect(drafts.get('col-a')).toBe('')
  })

  it('a keystroke in one column never wakes another column’s reader', () => {
    // The whole strip used to re-render per character typed anywhere on it:
    // one `$state` record, replaced whole per keystroke. The contract now is
    // per-key invalidation, which is what this effect count proves.
    drafts.set('col-mine', 'first')
    drafts.set('col-other', 'elsewhere')

    let reads = 0
    const stop = $effect.root(() => {
      $effect(() => {
        void drafts.get('col-other')
        reads += 1
      })
    })
    flushSync()
    expect(reads).toBe(1)

    drafts.set('col-mine', 'first keystroke')
    drafts.set('col-mine', 'first keystrokes')
    flushSync()
    expect(reads).toBe(1)

    drafts.set('col-other', 'its own write still lands')
    flushSync()
    expect(reads).toBe(2)

    stop()
    drafts.forget('col-mine')
    drafts.forget('col-other')
  })
})
