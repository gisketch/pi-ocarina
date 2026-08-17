import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchPage, isWriteMethod, MAX_BYTES, parseUrl, safeHeaders } from './fetch-page'

/** A real server on a real socket.
 *
 *  Stubbing `fetch` would test our own stub. The caps, the redirect handling
 *  and the content-type branch are all about what a server actually does. */
let server: Server
let origin = ''

const ARTICLE = `<html><head><title>Guide</title></head><body>
  <nav><a href="/">Home</a></nav>
  <article><h1>Pooling</h1><p>Reuse connections.</p></article>
</body></html>`

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    switch (url.pathname) {
      case '/article':
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(ARTICLE)
        return
      case '/json':
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{"ok":true}')
        return
      case '/binary':
        response.writeHead(200, { 'content-type': 'image/png', 'content-length': '9' })
        response.end(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))
        return
      case '/huge':
        response.writeHead(200, { 'content-type': 'text/plain' })
        // Far past the cap, written in pieces so the reader must stop early.
        for (let i = 0; i < 40; i += 1) response.write('x'.repeat(8 * 1024))
        response.end()
        return
      case '/moved':
        response.writeHead(302, { location: '/article' })
        response.end()
        return
      case '/boom':
        response.writeHead(500, { 'content-type': 'text/plain' })
        response.end('broken')
        return
      case '/echo':
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ method: request.method, seen: Object.keys(request.headers) }))
        return
      default:
        response.writeHead(404, { 'content-type': 'text/plain' })
        response.end('nope')
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('parseUrl', () => {
  it('takes http and https and nothing else', () => {
    expect(parseUrl('https://example.com')?.host).toBe('example.com')
    expect(parseUrl('http://example.com')?.host).toBe('example.com')
    // `file:` would turn a web tool into a disk reader with no gate in front.
    expect(parseUrl('file:///etc/passwd')).toBeNull()
    expect(parseUrl('data:text/html,<b>x')).toBeNull()
    expect(parseUrl('not a url')).toBeNull()
  })
})

describe('safeHeaders', () => {
  it('drops every credential header', () => {
    expect(safeHeaders({ Accept: 'text/html', Cookie: 'a=1', authorization: 'Bearer x' })).toEqual({
      Accept: 'text/html',
    })
  })
})

describe('isWriteMethod', () => {
  it('is true for everything that changes something', () => {
    expect(isWriteMethod('get')).toBe(false)
    expect(isWriteMethod('HEAD')).toBe(false)
    for (const method of ['POST', 'put', 'PATCH', 'DELETE']) {
      expect(isWriteMethod(method)).toBe(true)
    }
  })
})

describe('fetchPage', () => {
  it('returns a page as Markdown with its chrome removed', async () => {
    const outcome = await fetchPage({ url: `${origin}/article` })

    expect(outcome.status).toBe(200)
    expect(outcome.kind).toBe('html')
    expect(outcome.title).toBe('Guide')
    expect(outcome.body).toBe('# Pooling\n\nReuse connections.')
    expect(outcome.body).not.toContain('Home')
  })

  it('passes JSON through unconverted', async () => {
    const outcome = await fetchPage({ url: `${origin}/json` })

    expect(outcome.kind).toBe('text')
    expect(outcome.body).toBe('{"ok":true}')
  })

  it('describes a binary rather than decoding it', async () => {
    const outcome = await fetchPage({ url: `${origin}/binary` })

    expect(outcome.kind).toBe('binary')
    expect(outcome.body).toBe('')
    expect(outcome.bytes).toBe(9)
  })

  it('stops reading at the cap and says so', async () => {
    const outcome = await fetchPage({ url: `${origin}/huge` })

    expect(outcome.truncated).toBe(true)
    expect(outcome.bytes).toBe(MAX_BYTES)
    expect(outcome.body.length).toBeLessThanOrEqual(MAX_BYTES)
  })

  it('reports where a redirect ended, not where it started', async () => {
    const outcome = await fetchPage({ url: `${origin}/moved` })

    expect(outcome.url).toBe(`${origin}/article`)
    expect(outcome.body).toContain('Pooling')
  })

  it('reports a server error as a failed status, not as a thrown error', async () => {
    const outcome = await fetchPage({ url: `${origin}/boom` })

    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe(500)
    expect(outcome.error).toBeUndefined()
  })

  it('refuses an address that is not the web', async () => {
    const outcome = await fetchPage({ url: 'file:///etc/passwd' })

    expect(outcome.error).toContain('http')
    expect(outcome.status).toBe(0)
  })

  it('sends no credentials even when asked to', async () => {
    const outcome = await fetchPage({
      url: `${origin}/echo`,
      headers: { cookie: 'session=secret', 'x-fine': 'yes' },
    })

    const seen = JSON.parse(outcome.body) as { seen: string[] }
    expect(seen.seen).toContain('x-fine')
    expect(seen.seen).not.toContain('cookie')
  })

  it('carries a body on a write method', async () => {
    const outcome = await fetchPage({ url: `${origin}/echo`, method: 'POST', body: '{"a":1}' })

    expect(JSON.parse(outcome.body).method).toBe('POST')
  })

  it('fetches nothing when the caller has already given up', async () => {
    const outcome = await fetchPage({ url: `${origin}/article` }, AbortSignal.abort())

    expect(outcome.error).toBeDefined()
    expect(outcome.body).toBe('')
  })

  it('reports a dead host rather than throwing', async () => {
    // Port 1 is reserved and refuses immediately, so this stays fast.
    const outcome = await fetchPage({ url: 'http://127.0.0.1:1/x' })

    expect(outcome.error).toBeDefined()
    expect(outcome.status).toBe(0)
  })
})
