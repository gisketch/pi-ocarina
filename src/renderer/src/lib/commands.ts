import { fuzzyFilter } from './fuzzy'

export type CommandId =
  | 'jump-workspace'
  | 'new-thread'
  | 'next-thread'
  | 'switch-branch'
  | 'compact-thread'
  | 'cycle-permission'
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
  { id: 'cycle-permission', icon: '⛨', label: 'Permission for this thread', kbd: '␣ p' },
  { id: 'open-keymap', icon: '?', label: 'Open keymap', kbd: '␣ k' },
]

export function filterCommands(commands: readonly Command[], query: string): Command[] {
  return fuzzyFilter(commands, query, (command) => command.label)
}

export { fuzzyScore as scoreCommand, wrapIndex } from './fuzzy'
