import type { UiEvent } from '../../../../../shared/protocol'
import type { MockThread } from './types'

/** A thread long enough that most of it has never been measured.
 *
 *  The column virtualizes with `content-visibility: auto` and a
 *  `contain-intrinsic-size` guess of 120px per block, so a thread's height is
 *  a sum of guesses until the reader scrolls each block into view. Every other
 *  mock is short enough that the first paint measures all of it, which is why
 *  a jump to the end lands in one press here and takes several in a real
 *  thread. Nothing about the bug is reproducible without this. */
const TURNS = 90

/** Blocks that are much taller than the 120px guess, so the estimate is wrong
 *  in the direction that matters: the end of the thread is further away than
 *  the scrollbar thinks, not nearer. */
function paragraph(at: number): string {
  return Array.from(
    { length: 6 },
    (_, line) => `Line ${line + 1} of turn ${at}, long enough to wrap inside the column and cost real height.`,
  ).join('\n\n')
}

export const LONG_THREAD: MockThread = {
  events: Array.from({ length: TURNS }, (_, at): UiEvent[] => [
    { kind: 'user-message', id: `u${at}`, text: `Turn ${at}: keep going.` },
    { kind: 'agent-message-start', id: `a${at}` },
    { kind: 'agent-message-delta', id: `a${at}`, text: paragraph(at) },
    { kind: 'agent-message-end', id: `a${at}` },
  ]).flat(),
}
