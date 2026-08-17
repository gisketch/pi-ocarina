/** Whether a string can be a git branch name.
 *
 *  Shared rather than duplicated: the dialog that takes the name and the code
 *  that runs `git worktree add` must agree about what is legal, or the reader
 *  types something the field accepts and git rejects a moment later, with no
 *  field left to show the reason in.
 *
 *  These are git's own rules from `git check-ref-format`, minus the ones a
 *  branch name typed by a person cannot break. */

const ILLEGAL_CHARACTERS = /[\s~^:?*[\\]/
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/** The first rule the name breaks, or null when it is legal. */
export function validateBranchName(name: string): string | null {
  if (name.length === 0) return 'a branch needs a name'
  if (ILLEGAL_CHARACTERS.test(name)) return 'no spaces, and none of ~ ^ : ? * [ \\'
  if (CONTROL_CHARACTERS.test(name)) return 'no control characters'
  // A leading dash makes the name an option to every git command it is passed
  // to, so this one is about what happens downstream rather than about refs.
  if (name.startsWith('-')) return 'no leading -'
  if (name.includes('..')) return 'no ..'
  if (name.includes('@{')) return 'no @{'
  if (name === '@') return '@ is not a branch name'
  if (name.startsWith('/') || name.endsWith('/')) return 'no leading or trailing /'
  if (name.includes('//')) return 'no empty path segment'
  if (name.endsWith('.')) return 'no trailing .'
  // Every segment carries the dot rules too: `feat/.hidden` is rejected by git
  // for the same reason `.hidden` is.
  for (const segment of name.split('/')) {
    if (segment.startsWith('.')) return 'no segment starting with .'
    if (segment.endsWith('.lock')) return 'no .lock ending'
  }
  return null
}

/** The directory a branch's worktree lives in, under the worktree root.
 *
 *  `/` is the one legal branch character that would otherwise turn a flat list
 *  of worktrees into a tree of directories. */
export function worktreeDirName(branch: string): string {
  return branch.replaceAll('/', '-')
}
