import { describe, it } from 'vitest'
import { extractArticle } from './extract'

describe('hostile html', () => {
  it('10000 nested divs', () => {
    const html = `<html><body>${'<div>'.repeat(10000)}hello${'</div>'.repeat(10000)}</body></html>`
    try {
      const out = extractArticle(html)
      console.log('OK divs, markdown len', out.markdown.length)
    } catch (e) {
      console.log('THREW divs:', (e as Error).constructor.name, (e as Error).message)
    }
  })
  it('10000 unclosed divs', () => {
    const html = `<html><body>${'<div>'.repeat(10000)}hello</body></html>`
    try {
      const out = extractArticle(html)
      console.log('OK unclosed, markdown len', out.markdown.length)
    } catch (e) {
      console.log('THREW unclosed:', (e as Error).constructor.name, (e as Error).message)
    }
  })
  it('5000 nested spans inline', () => {
    const html = `<html><body><p>${'<span>'.repeat(5000)}hi${'</span>'.repeat(5000)}</p></body></html>`
    try {
      const out = extractArticle(html)
      console.log('OK spans, len', out.markdown.length)
    } catch (e) {
      console.log('THREW spans:', (e as Error).constructor.name, (e as Error).message)
    }
  })
  it('nested blockquotes 3000', () => {
    const html = `<html><body>${'<blockquote>'.repeat(3000)}hi${'</blockquote>'.repeat(3000)}</body></html>`
    try {
      const out = extractArticle(html)
      console.log('OK quotes, len', out.markdown.length)
    } catch (e) {
      console.log('THREW quotes:', (e as Error).constructor.name, (e as Error).message)
    }
  })
})
