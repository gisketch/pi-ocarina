/** Turning a symbol's name into a position in a file.
 *
 *  This is the whole reason these tools are usable. LSP speaks in line and
 *  character, and a model does not know the column a symbol starts at — it
 *  would have to read the file first, which is the cost these tools exist to
 *  avoid. So the tools take a name, and this resolves it.
 *
 *  An ambiguous name is answered with its candidates rather than a guess: three
 *  things called `draw` is a real situation, and picking one silently would
 *  make the answer wrong in a way nobody could see. */

import { symbolKind, type Position, type Symbol } from './client'

export interface Found {
  name: string
  kind: string
  position: Position
  line: number
}

/** Every symbol in the file, hierarchy flattened, in the order a reader would
 *  scan them. */
export function flatten(symbols: readonly Symbol[]): Found[] {
  const found: Found[] = []

  const walk = (list: readonly Symbol[]): void => {
    for (const symbol of list) {
      // Servers answer with either the nested `DocumentSymbol` shape or the
      // flat `SymbolInformation` one, which carries its range in `location`.
      const range = symbol.selectionRange ?? symbol.range ?? symbol.location?.range
      if (range) {
        found.push({
          name: symbol.name,
          kind: symbolKind(symbol.kind),
          position: range.start,
          line: range.start.line + 1,
        })
      }
      if (symbol.children) walk(symbol.children)
    }
  }
  walk(symbols)

  return found
}

export type Located =
  | { at: Found }
  | { ambiguous: Found[] }
  | { missing: true; available: Found[] }

/** Finds the one symbol this name means, or says why it cannot. */
export function locate(symbols: readonly Symbol[], name: string): Located {
  const all = flatten(symbols)
  const exact = all.filter((one) => one.name === name)

  if (exact.length === 1) return { at: exact[0] }
  if (exact.length > 1) return { ambiguous: exact }

  // A near miss is worth trying before giving up: models write `Ledger.draw`
  // and `draw()` for a symbol the server calls `draw`.
  const bare = name.replace(/\(\)$/, '')
  const tail = bare.slice(bare.lastIndexOf('.') + 1)
  const loose = all.filter((one) => one.name === tail)
  if (loose.length === 1) return { at: loose[0] }
  if (loose.length > 1) return { ambiguous: loose }

  return { missing: true, available: all }
}

/** How many names to list when a symbol was not found. Enough to spot a typo,
 *  short enough that a failed lookup does not cost more than the answer would
 *  have. */
export const LISTED = 30

export function describeMissing(name: string, available: readonly Found[]): string {
  if (available.length === 0) {
    return `no symbol named "${name}" here, and the server found no symbols in this file`
  }
  const names = available.slice(0, LISTED).map((one) => `${one.name} (${one.kind})`)
  const more = available.length > LISTED ? `, and ${available.length - LISTED} more` : ''
  return `no symbol named "${name}" here. This file has: ${names.join(', ')}${more}`
}

export function describeAmbiguous(name: string, candidates: readonly Found[]): string {
  const lines = candidates.map((one) => `  line ${one.line} — ${one.kind} ${one.name}`)
  return `"${name}" is several things in this file. Ask again with a line:\n${lines.join('\n')}`
}
