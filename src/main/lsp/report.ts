/** Turning a server's answer into lines a model can act on.
 *
 *  Compact on purpose. These tools exist to spend fewer tokens than reading the
 *  files would have, and a JSON dump of `Location` objects spends more. Every
 *  line here is `path:line` first, because that is what the next tool call
 *  needs. */

import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Diagnostic, Location } from './client'

/** Results are capped: a symbol with four hundred call sites is a fact worth
 *  stating, not four hundred lines worth pasting. */
export const MAX_RESULTS = 60
export const MAX_DIAGNOSTICS = 40

/** A server's URI as a workspace-relative path.
 *
 *  Null when it points outside the workspace — into `node_modules`' real
 *  location, a global toolchain, anywhere. Those are real answers but they are
 *  not this workspace's files, and a path the reader cannot open is noise. */
export function insideWorkspace(uri: string, cwd: string): string | null {
  let path: string
  try {
    path = uri.startsWith('file://') ? fileURLToPath(uri) : uri
  } catch {
    return null
  }

  const rel = relative(cwd, path)
  if (rel === '' || rel.startsWith('..') || resolve(cwd, rel) !== resolve(path)) return null
  return rel
}

/** Where a location is, as the reader and the next call would write it. */
export function where(location: Location, cwd: string): string | null {
  const path = insideWorkspace(location.uri, cwd)
  if (path === null) return null
  return `${path}:${location.range.start.line + 1}`
}

export function listLocations(locations: readonly Location[], cwd: string, what: string): string {
  const inside = locations.map((one) => where(one, cwd)).filter((one): one is string => one !== null)
  const outside = locations.length - inside.length

  if (inside.length === 0) {
    return outside > 0
      ? `no ${what} in this workspace (${outside} outside it, in dependencies or the toolchain)`
      : `no ${what} found`
  }

  const shown = inside.slice(0, MAX_RESULTS)
  const notes: string[] = []
  if (inside.length > shown.length) notes.push(`${inside.length - shown.length} more`)
  if (outside > 0) notes.push(`${outside} outside this workspace`)

  const tail = notes.length > 0 ? `\n(${notes.join(', ')})` : ''
  return `${inside.length} ${what}:\n${shown.join('\n')}${tail}`
}

const SEVERITY: Record<number, string> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' }

/** A diagnostics row's summary: what the reader needs before expanding.
 *
 *  Errors and warnings only. Info and hints are real but they are not why
 *  anyone looks at this row, and a summary that counts them buries the two
 *  numbers that matter. */
export function countProblems(diagnostics: readonly Diagnostic[]): string {
  const errors = diagnostics.filter((one) => (one.severity ?? 1) === 1).length
  const warns = diagnostics.filter((one) => one.severity === 2).length
  if (errors === 0 && warns === 0) return 'clean'

  const parts: string[] = []
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`)
  if (warns > 0) parts.push(`${warns} warn${warns === 1 ? '' : 's'}`)
  return parts.join(' ')
}

/** A locations row's summary: how many, and across how many files.
 *
 *  Counts only what is inside the workspace, because that is what the list
 *  shows. A summary that counted the toolchain's hits would promise lines the
 *  expansion does not have. */
export function countPlaces(
  locations: readonly Location[],
  cwd: string,
  what: string,
): string {
  const inside = locations
    .map((one) => insideWorkspace(one.uri, cwd))
    .filter((one): one is string => one !== null)
  if (inside.length === 0) return `no ${what}s`

  const files = new Set(inside).size
  const count = `${inside.length} ${what}${inside.length === 1 ? '' : 's'}`
  return files > 1 ? `${count} · ${files} files` : count
}

/** The first line of a hover, which is the signature. */
export function firstLine(text: string): string {
  const line = text.split('\n').find((one) => one.trim() !== '')?.trim() ?? ''
  return line.length > 48 ? `${line.slice(0, 47)}…` : line
}

export function describeDiagnostics(
  diagnostics: readonly Diagnostic[],
  path: string,
  errorsOnly = false,
): string {
  const wanted = errorsOnly
    ? diagnostics.filter((one) => (one.severity ?? 1) === 1)
    : [...diagnostics]

  if (wanted.length === 0) return errorsOnly ? '' : `${path}: no problems reported`

  const shown = wanted.slice(0, MAX_DIAGNOSTICS)
  const lines = shown.map((one) => {
    const level = SEVERITY[one.severity ?? 1] ?? 'error'
    // The message is flattened: a multi-line type error is one row here, and
    // its detail is one hover away.
    const message = one.message.replace(/\s*\n\s*/g, ' ').trim()
    return `${path}:${one.range.start.line + 1} ${level}: ${message}`
  })

  const more = wanted.length > shown.length ? `\n(${wanted.length - shown.length} more)` : ''
  return `${lines.join('\n')}${more}`
}

/** The lines appended to an edit's result.
 *
 *  Errors only, and few of them: this rides on every write, so it has to cost
 *  almost nothing when the file is fine and say the important thing when it is
 *  not. */
export const INJECTED_LINES = 10

export function injectionFor(diagnostics: readonly Diagnostic[], path: string): string {
  const errors = diagnostics.filter((one) => (one.severity ?? 1) === 1)
  if (errors.length === 0) return ''

  const shown = errors.slice(0, INJECTED_LINES)
  const lines = shown.map(
    (one) => `  ${path}:${one.range.start.line + 1} ${one.message.replace(/\s*\n\s*/g, ' ').trim()}`,
  )
  const more = errors.length > shown.length ? `\n  (${errors.length - shown.length} more)` : ''

  return `\n\nThe language server reports ${errors.length} error${errors.length === 1 ? '' : 's'} in this file after your change:\n${lines.join('\n')}${more}`
}
