/** The reader's own allow and deny rules.
 *
 *  Two levels, unioned: rules with no workspace apply everywhere, and a
 *  workspace's own apply there. Trust is repository-shaped — `pnpm test` being
 *  safe in a repository the reader owns is not a statement about every
 *  repository on the machine.
 *
 *  **Deny always wins, and an allow can never reach a protected path.** Writing
 *  `.env` stays a card whatever the file says. A configuration file that could
 *  silently permit that is a configuration file worth attacking, and the level
 *  that permits everything already exists and is called `full access`. */

import type { RuleEntry } from '../../shared/config-file'
import {
  insideWorkspace,
  isProtectedPath,
  segmentsOf,
  staysInside,
  SUBSTITUTION,
} from './auto-policy'

/** What a rule matches against: the command for `bash`, the path otherwise. */
export function subjectOf(toolName: string, input: unknown): string {
  const record = (input ?? {}) as Record<string, unknown>
  const pick = (key: string): string | undefined =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined

  if (toolName === 'bash') return (pick('command') ?? '').trim()
  return pick('path') ?? pick('file_path') ?? pick('url') ?? ''
}

function covers(rule: RuleEntry, toolName: string, subject: string, cwd: string | null): boolean {
  if (rule.tool !== '*' && rule.tool !== toolName) return false
  if (rule.workspace !== undefined && rule.workspace !== cwd) return false
  return subject.startsWith(rule.match)
}

/** Whether an allow may stand for this call.
 *
 *  A rule matches by prefix, which is right for naming a command and wrong for
 *  deciding one is safe: `pnpm test` is a prefix of
 *  `pnpm test && rm -rf .git`, and `echo` is a prefix of `echo x > .env`. The
 *  gate's own `ruleKey` already refuses to key a remembered approval on a
 *  compound command for exactly this reason; a written rule has to hold the
 *  same line or it is a quieter way around it.
 *
 *  So an allow covers a *simple* command only, every segment of which stays
 *  inside the workspace and touches nothing protected. Anything else falls back
 *  to the level, which asks. */
function allowMayStand(toolName: string, subject: string, cwd: string | null): boolean {
  if (cwd === null) return false

  if (toolName === 'bash') {
    if (SUBSTITUTION.test(subject)) return false
    const segments = segmentsOf(subject)
    // More than one segment is a chain. The reader named one command; the
    // model wrote several, and the rule says nothing about the rest.
    if (segments.length !== 1) return false
    if (!staysInside(segments[0], cwd)) return false
    return !segments[0]
      .split(/\s+/)
      .some((word) => {
        const full = insideWorkspace(word, cwd)
        return full !== null && isProtectedPath(full)
      })
  }

  if (toolName === 'write' || toolName === 'edit') {
    const full = insideWorkspace(subject, cwd)
    return full !== null && !isProtectedPath(full)
  }

  return true
}

export type RuleVerdict = 'allow' | 'deny' | 'nothing'

/** What the reader's rules say about one call.
 *
 *  `nothing` is the common answer and means "carry on as if this file did not
 *  exist" — the level decides, and the card is raised or not on its own terms. */
export function ruleVerdict(
  rules: readonly RuleEntry[],
  toolName: string,
  input: unknown,
  cwd: string | null,
): RuleVerdict {
  const subject = subjectOf(toolName, input)
  if (subject === '') return 'nothing'

  const matching = rules.filter((rule) => covers(rule, toolName, subject, cwd))
  if (matching.length === 0) return 'nothing'

  // Every match is considered, not the first: a reader who wrote a broad allow
  // and a narrow deny meant the deny.
  if (matching.some((rule) => rule.effect === 'deny')) return 'deny'

  // An allow cannot reach a protected path or leave the workspace, however it
  // was written.
  return allowMayStand(toolName, subject, cwd) ? 'allow' : 'nothing'
}
