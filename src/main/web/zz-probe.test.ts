import { describe, it } from 'vitest'
import { extractArticle } from './extract'

const try_ = (label: string, html: string) => {
  try { extractArticle(html); console.log(label, 'ok') } catch (e) { console.log(label, 'THREW', (e as Error).message) }
}

describe('depth threshold', () => {
  it('divs', () => {
    for (const n of [3500, 4000, 5000, 6000, 8000]) {
      try_(`div ${n}`, `<html><body>${'<div>'.repeat(n)}hello${'</div>'.repeat(n)}</body></html>`)
    }
  })
  it('blockquote', () => {
    for (const n of [200, 400, 800, 1600, 3000]) {
      try_(`bq ${n}`, `<html><body>${'<blockquote>'.repeat(n)}hi${'</blockquote>'.repeat(n)}</body></html>`)
    }
  })
  it('nested lists', () => {
    for (const n of [500, 1000, 2000]) {
      try_(`ul ${n}`, `<html><body>${'<ul><li>x'.repeat(n)}${'</li></ul>'.repeat(n)}</body></html>`)
    }
  })
  it('spans inline', () => {
    for (const n of [1000, 2000, 3000, 4000]) {
      try_(`span ${n}`, `<html><body><p>${'<span>'.repeat(n)}hi${'</span>'.repeat(n)}</p></body></html>`)
    }
  })
})
