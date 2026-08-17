/** How a child agent's row reads: its mark, its tone, and its clock.
 *
 *  Held apart from the component so the same formatting can be asserted
 *  without a DOM, and so the duration format — which must never change width
 *  while a row is on screen — is one function with tests rather than a
 *  template expression. */

import type { AgentStatus } from './thread'

/** What a settled child shows in place of its live cell. */
export function agentMark(status: AgentStatus): string {
  switch (status) {
    case 'ok':
      return '✓'
    case 'fail':
      return '✗'
    case 'denied':
      return '⊘'
    case 'cancelled':
      return '⊗'
    default:
      return '·'
  }
}

/** Three tones, not five: denied and cancelled are both "stopped by a person",
 *  and colouring them apart would ask the reader to learn a difference the
 *  mark already carries. */
export function agentTone(status: AgentStatus): 'ok' | 'fail' | 'warn' | '' {
  if (status === 'ok') return 'ok'
  if (status === 'fail') return 'fail'
  if (status === 'denied' || status === 'cancelled') return 'warn'
  return ''
}

/** How long a child has been running, at fixed width.
 *
 *  Always `mm:ss`, so the string is five characters from the first second to
 *  the fifty-ninth minute and the row cannot reflow while it ticks. Tabular
 *  figures fix the width of a digit; only padding fixes the *number* of them,
 *  and `9:59` becoming `10:00` is a real reflow however the digits are drawn.
 *
 *  An hour grows the string once. A child still running after an hour has a
 *  worse problem than a row that moved. */
export function elapsedText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)

  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${tail}` : tail
}
