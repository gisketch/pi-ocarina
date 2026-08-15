export type CommandId =
  | 'jump-workspace'
  | 'new-thread'
  | 'next-thread'
  | 'switch-branch'
  | 'compact-thread'
  | 'open-keymap'

export interface Command {
  id: CommandId
  icon: string
  label: string
  kbd: string
}

/** Palette contents, in the reference's order. */
export const COMMANDS: readonly Command[] = [
  { id: 'jump-workspace', icon: '♪', label: 'Jump to workspace…', kbd: '␣ 1–3' },
  { id: 'new-thread', icon: '+', label: 'New thread in this workspace', kbd: '␣ n' },
  { id: 'next-thread', icon: '⟷', label: 'Next thread column', kbd: 'l' },
  { id: 'switch-branch', icon: '⎇', label: 'Switch branch', kbd: '⌘B' },
  { id: 'compact-thread', icon: '⌫', label: 'Compact thread (summarize context)', kbd: '␣ c' },
  { id: 'open-keymap', icon: '?', label: 'Open keymap', kbd: '␣ k' },
]

/** Subsequence match, case-insensitive: "ntc" finds "New Thread in this workspaCe".
 *  Returns null when the query does not match at all. Lower score sorts first. */
export function scoreCommand(label: string, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (q === '') return 0
  const haystack = label.toLowerCase()

  let index = 0
  let score = 0
  let previous = -1
  for (const ch of q) {
    const found = haystack.indexOf(ch, index)
    if (found === -1) return null
    // Prefer matches that are contiguous and start on a word boundary.
    const gap = previous === -1 ? found : found - previous - 1
    score += gap
    previous = found
    index = found + 1
  }
  return score
}

export function filterCommands(commands: readonly Command[], query: string): Command[] {
  return commands
    .map((command) => ({ command, score: scoreCommand(command.label, query) }))
    .filter((entry): entry is { command: Command; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.command)
}

/** Wraps an index into a list, so arrow keys cycle at both ends. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}
