/** How much this app asks before it lets a tool run.
 *
 *  Three levels, resolved from three places. The type and the resolver live in
 *  shared because both sides speak them — main enforces, the renderer displays
 *  and offers the picker — but nothing here touches a path or a process. The
 *  rule that reads arguments is in main, where the filesystem is. */

export type PermissionLevel = 'ask' | 'auto' | 'full'

/** In the order the picker cycles them: least to most trusting. */
export const PERMISSION_LEVELS: readonly PermissionLevel[] = ['ask', 'auto', 'full']

export const DEFAULT_PERMISSION: PermissionLevel = 'auto'

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return value === 'ask' || value === 'auto' || value === 'full'
}

/** What the picker and the status bar call each level.
 *
 *  `full` says what it costs rather than what it saves. A level that never asks
 *  is the one place a reader deserves the sentence before they choose it, not
 *  after. */
export const PERMISSION_LABELS: Readonly<Record<PermissionLevel, string>> = {
  ask: 'ask',
  auto: 'auto',
  full: 'full access',
}

export const PERMISSION_NOTES: Readonly<Record<PermissionLevel, string>> = {
  ask: 'asks the first time it uses anything that changes something',
  auto: 'asks only about what leaves the workspace, or cannot be undone',
  full: 'never asks — there is no sandbox here, so it can do anything you can',
}

/** The level in force, from the three places one can be set.
 *
 *  Absent means inherit, never means `ask`: a workspace with no opinion follows
 *  the global default, and a thread with no opinion follows its workspace. */
export function resolveLevel(
  thread: PermissionLevel | undefined,
  workspace: PermissionLevel | undefined,
  global: PermissionLevel,
): PermissionLevel {
  return thread ?? workspace ?? global
}

/** The next value the workspace row shows, cycling through inherit.
 *
 *  Inherit is a value in the cycle rather than a separate control, because it
 *  is the state most workspaces should be in and a reader has to be able to get
 *  back to it. */
export function nextLevel(current: PermissionLevel | undefined): PermissionLevel | undefined {
  if (current === undefined) return 'ask'
  const at = PERMISSION_LEVELS.indexOf(current)
  return at === PERMISSION_LEVELS.length - 1 ? undefined : PERMISSION_LEVELS[at + 1]
}
