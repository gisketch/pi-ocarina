/** One HTTP request, bounded, and whatever came back made readable.
 *
 *  Node ships `fetch`, so the transport is free and nothing is added to the
 *  bundle. What this file owns is everything the transport does not: the caps,
 *  the headers we refuse to send, and turning a response into something worth
 *  putting in a context window. */

import { bodyKind, extractArticle } from './extract'

/** Long enough for a slow documentation host, short enough that a dead one
 *  does not hold a turn open. */
export const TIMEOUT_MS = 30_000

/** Read cap, applied while reading rather than after: discovering a two
 *  gigabyte response by buffering it is not a cap. */
export const MAX_BYTES = 100 * 1024

/** Headers the model may never set.
 *
 *  This app does not authenticate to third parties on the user's behalf. A
 *  page that needs a login fails honestly instead. */
const REFUSED = new Set(['cookie', 'authorization', 'proxy-authorization', 'set-cookie'])

export interface FetchAsk {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface FetchOutcome {
  /** Where the request ended up, which is not always where it started. */
  url: string
  status: number
  ok: boolean
  contentType: string
  bytes: number
  truncated: boolean
  kind: 'html' | 'text' | 'binary'
  /** Markdown for a page, the body itself for text, empty for a binary. */
  body: string
  title?: string
  /** Set when the request never produced a response at all. */
  error?: string
}

export function safeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const safe: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (REFUSED.has(name.toLowerCase())) continue
    safe[name] = value
  }
  return safe
}

/** Whether this method changes something on someone else's server. */
export function isWriteMethod(method: string): boolean {
  const upper = method.toUpperCase()
  return upper !== 'GET' && upper !== 'HEAD'
}

/** Rejects anything that is not a web address.
 *
 *  `file:` and `data:` would turn a web tool into a disk reader with no
 *  approval gate in front of it. Local addresses are allowed: a developer's own
 *  server is a legitimate target, the agent already has `bash`, and the row
 *  names the host either way. */
export function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Reads a body up to the cap, and stops pulling once it is reached. */
async function readCapped(
  response: Response,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const stream = response.body
  if (!stream) return { text: '', bytes: 0, truncated: false }

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  let truncated = false

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      // Strictly greater: a body of exactly the cap is complete, and calling it
      // truncated tells the model a page continued when it did not.
      if (bytes > MAX_BYTES) {
        chunks.push(value.slice(0, value.byteLength - (bytes - MAX_BYTES)))
        truncated = true
        break
      }
      chunks.push(value)
    }
  } finally {
    // Cancel rather than leave the socket draining a page we stopped reading.
    await reader.cancel().catch(() => {})
  }

  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let at = 0
  for (const chunk of chunks) {
    joined.set(chunk, at)
    at += chunk.byteLength
  }

  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(joined),
    bytes: truncated ? MAX_BYTES : bytes,
    truncated,
  }
}

/** How big a body actually was, without keeping it.
 *
 *  Bounded by the same cap: a binary is not decoded, and counting an unbounded
 *  stream to report a number would be worse than the number being approximate. */
async function countBytes(response: Response): Promise<number> {
  const stream = response.body
  if (!stream) return 0

  const reader = stream.getReader()
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value?.byteLength ?? 0
      if (bytes >= MAX_BYTES) break
    }
  } catch {
    // A stream that broke mid-count still reports what it managed.
  } finally {
    await reader.cancel().catch(() => {})
  }
  return bytes
}

export async function fetchPage(ask: FetchAsk, signal?: AbortSignal): Promise<FetchOutcome> {
  const url = parseUrl(ask.url)
  const method = (ask.method ?? 'GET').toUpperCase()

  const failed = (error: string): FetchOutcome => ({
    url: ask.url,
    status: 0,
    ok: false,
    contentType: '',
    bytes: 0,
    truncated: false,
    kind: 'text',
    body: '',
    error,
  })

  if (!url) return failed(`not an http or https address: ${ask.url}`)

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: safeHeaders(ask.headers),
      ...(ask.body !== undefined && method !== 'GET' && method !== 'HEAD' ? { body: ask.body } : {}),
      redirect: 'follow',
      signal: abort,
    })
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : String(thrown)
    return failed(timeout.aborted ? `no response within ${TIMEOUT_MS / 1000}s` : reason)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const kind = bodyKind(contentType)

  if (method === 'HEAD' || kind === 'binary') {
    // Nothing readable to carry back. The header is used when the server sent
    // one; when it did not, the bytes are counted rather than reported as
    // zero — "0.0KB" for a real image is a measurement that is simply false.
    const declared = Number(response.headers.get('content-length'))
    const known = Number.isFinite(declared) && declared > 0
    const counted = known ? declared : method === 'HEAD' ? 0 : await countBytes(response)
    if (known) await response.body?.cancel().catch(() => {})

    return {
      url: response.url || ask.url,
      status: response.status,
      ok: response.ok,
      contentType,
      bytes: counted,
      truncated: false,
      kind,
      body: '',
    }
  }

  let read: { text: string; bytes: number; truncated: boolean }
  try {
    read = await readCapped(response)
  } catch (thrown) {
    return failed(thrown instanceof Error ? thrown.message : String(thrown))
  }

  const article = kind === 'html' ? extractArticle(read.text) : null

  return {
    url: response.url || ask.url,
    status: response.status,
    ok: response.ok,
    contentType,
    bytes: read.bytes,
    truncated: read.truncated,
    kind,
    body: article ? article.markdown : read.text,
    ...(article && article.title !== '' ? { title: article.title } : {}),
  }
}
