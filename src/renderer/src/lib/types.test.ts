import { describe, expect, it } from 'vitest'
import { threadOf, type Thread } from './types'

const column = (over: Partial<Thread>): Thread => ({
  id: 's1',
  title: 'first',
  status: 'idle',
  meta: '',
  ...over,
})

describe('which columns are threads', () => {
  it('answers with the id for a column pi listed', () => {
    expect(threadOf(column({ id: 's1' }))).toBe('s1')
  })

  it('answers null for the placeholder a workspace with no threads draws', () => {
    // The reported bug: `fresh:<workspace>` was spent as a thread id, and main
    // answered every command about it with `unknown thread`.
    expect(threadOf(column({ id: 'fresh:w1', fresh: true }))).toBeNull()
  })

  it('answers null for a workspace shell', () => {
    expect(threadOf(column({ id: 'terminal:w1', terminal: true }))).toBeNull()
  })

  it('answers null for the empty column, which stands for no workspace at all', () => {
    expect(threadOf(column({ id: '' }))).toBeNull()
  })
})
