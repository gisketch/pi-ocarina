/** The keyboard's vocabulary: what a mode is, what an overlay is, and what the
 *  reducer may ask the app to do.
 *
 *  Split from the reducer so the two questions a reader arrives with — "what
 *  can this return" and "what does this key do" — are two files. `keyboard.ts`
 *  re-exports every name here, so no call site had to move. */

import type { Mode } from './types'

export type Overlay =
  | 'palette'
  | 'switcher'
  | 'keymap'
  | 'settings'
  | 'model'
  | 'mode'
  | 'modes'
  | 'search'
  /** The dashboard's thread picker: fzf over the workspace's history. */
  | 'threads'
  /** `␣f`: the file search over the focused workspace. */
  | 'filefind'
  | 'roles'
  | 'workspace'
  | 'keybinds'

export interface KeyState {
  mode: Mode
  /** Overlays are mutually exclusive by construction. */
  overlay: Overlay | null
}

export type Action =
  | { type: 'goWorkspace'; index: number }
  | { type: 'moveThread'; delta: number }
  | { type: 'moveBlock'; delta: number }
  | { type: 'scroll'; delta: number }
  | { type: 'leap' }
  | { type: 'openChanges' }
  | { type: 'openBlockMenu' }
  | { type: 'expandBlock'; open: boolean }
  | { type: 'newThread' }
  /** Open the worktree branch field on the focused dashboard column. */
  | { type: 'worktreeThread' }
  /** Move the dashboard's recent-thread selection bar. */
  | { type: 'dashboardMove'; delta: number }
  /** Open the dashboard's selected recent thread. */
  | { type: 'dashboardOpen' }
  | { type: 'closeThread' }
  /** Open the rename dialog on the focused thread. */
  | { type: 'renameThread' }
  | { type: 'openTerminal' }
  /** Back to the newest content in the focused thread, and pinned there. */
  | { type: 'jumpToLive' }
  /** Show or hide what the model thought, everywhere. */
  | { type: 'toggleReasoning' }
  | { type: 'termEscape' }
  | { type: 'moveColumn'; delta: number }
  | { type: 'pinWorkspace' }
  | { type: 'compact' }
  | { type: 'cyclePermission' }
  | { type: 'yank' }
  | { type: 'focusComposer' }
  | { type: 'blurComposer' }
  | { type: 'focusPalette' }
  | { type: 'focusSwitcher' }

export interface KeyEventLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  /** True when a surface answered this key in the target phase — a picker's
   *  input, a form field. The shell never reads such a key again. */
  defaultPrevented?: boolean
}

export interface KeyContext {
  /** Number of pinned workspaces; digit keys beyond this are ignored. */
  workspaceCount: number
  /** Whether the focused column is a shell. A shell has no blocks, so the
   *  transcript keys stay a scroll and READ is never entered. */
  terminalColumn: boolean
  /** Whether the focused column is a dashboard. Its rows take j/k and enter;
   *  READ is never entered — there is no transcript to dim. */
  dashboardColumn?: boolean
}

export interface KeyResult {
  state: KeyState
  actions: Action[]
  /** Caller should preventDefault when true. */
  preventDefault: boolean
  /** Leader timeout lifecycle for the caller to honour. */
  timer: 'start' | 'clear' | null
}

/** Keys that only ever modify another key. Pressing one is not an answer to
 *  anything, so a modal question must let them pass rather than read it as a
 *  decline. */
export const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
])

export const LEADER_TIMEOUT_MS = 2600
/** How far a terminal column scrolls per keypress. Thread columns move by a
 *  block instead, so this is the pty's step only. */
export const SCROLL_STEP = 100

export const initialKeyState: KeyState = { mode: 'OCARINA', overlay: null }

