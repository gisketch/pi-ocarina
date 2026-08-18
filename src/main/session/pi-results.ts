/** Reading what a finished call actually said.
 *
 *  Split from the translator because these answer a different question. The
 *  translator turns pi's *events* into the app's vocabulary; these read the
 *  *results* those events carry — a shape pi does not type, arriving from
 *  tools this app wrote and tools it did not. Shared with replay, so a tool
 *  reads the same live and on reopen.
 */

import type { TerminalLine, ToolBody } from '../../shared/vocabulary'
import { FETCH_TOOL } from './fetch-tool'
import { toolDetail } from './tool-rows'

/** Longest tool body we forward. A tool that prints a megabyte should not cost
 *  a megabyte of IPC; the ledger only ever shows a preview anyway. */
const MAX_BODY_LINES = 40

/** Pulls readable text out of a tool result of unknown shape. */
export function resultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (typeof result !== 'object' || result === null) return ''

  const content = (result as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string'
          ? ((part as { text: string }).text)
          : '',
      )
      .join('')
  }

  return ''
}

/** Joins the text parts of a message's content, ignoring thinking and tool
 *  calls. Shared with replay so both paths read a message the same way. */
export function joinTextParts(parts: readonly unknown[]): string {
  return parts
    .map((part) => {
      const content = part as { type?: string; text?: string }
      return content.type === 'text' && content.text ? content.text : ''
    })
    .join('')
}

/** Shared with replay so a tool looks the same live and on reopen. */
export function toolBody(toolName: string, result: unknown): ToolBody | undefined {
  const text = resultText(result)
  if (!text.trim()) return undefined

  const lines = text.split('\n').slice(0, MAX_BODY_LINES)

  if (toolName === 'bash') {
    return { type: 'terminal', lines: lines.map((line): TerminalLine => ({ text: line })) }
  }
  if (toolName === 'read') {
    return { type: 'code', lines: lines.map((line) => ({ text: line })) }
  }
  if (toolName === FETCH_TOOL) {
    // The first line is the status line the model reads; the row's meta
    // already says all of it, so the panel starts at the page itself.
    const body = text.split('\n').slice(2).join('\n').trim()
    return body === '' ? undefined : { type: 'markdown', text: body }
  }
  return undefined
}

/** What a finished fetch adds to its row: the status and the size.
 *
 *  Read from `details`, which the tool sets and which never reaches the model,
 *  so the row states what actually happened rather than parsing the prose the
 *  model was given. */
export function fetchMeta(result: unknown): string | undefined {
  const details = (result as { details?: unknown } | null)?.details as
    | { status?: number; bytes?: number; truncated?: boolean; error?: string }
    | undefined
  if (!details) return undefined
  if (details.error) return 'failed'

  const parts: string[] = []
  if (typeof details.status === 'number' && details.status > 0) parts.push(String(details.status))
  if (typeof details.bytes === 'number') parts.push(`${(details.bytes / 1024).toFixed(1)}KB`)
  if (details.truncated) parts.push('truncated')
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** What a finished language-server call adds to its row.
 *
 *  Read from `details`, which the tool sets and the model never sees, for the
 *  same reason `fetchMeta` does: the tool counted, so the row states its
 *  count rather than parsing it back out of the prose. */
export function lspMeta(toolName: string, result: unknown): string | undefined {
  if (toolDetail(toolName) === undefined) return undefined
  const details = (result as { details?: unknown } | null)?.details as
    | { summary?: unknown }
    | undefined
  return typeof details?.summary === 'string' ? details.summary : undefined
}
