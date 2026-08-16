import type { UiEvent } from '../../../shared/protocol'
import type { ToastRequest } from './state/toasts.svelte'

/** What the toast stack needs to know about the thread an event came from. */
export interface NoticeContext {
  /** True when the user is looking at this thread right now. */
  focused: boolean
  /** True when the thread was mid-turn before these events. */
  wasRunning: boolean
}

/** Which events deserve a toast.
 *
 *  One rule decides all of them: a toast is for what the user cannot see. The
 *  focused thread reports its own finish, its own failure and its own
 *  compaction, in the thread, where the person is already looking. Saying it
 *  again in the corner would teach them to ignore the corner.
 *
 *  `wasRunning` is the second half of it. Reopening a thread replays its
 *  history and ends on `done` too, and a toast for that would announce
 *  something the user just did themselves. */
export function noticesFor(events: readonly UiEvent[], ctx: NoticeContext): ToastRequest[] {
  if (ctx.focused) return []

  const notices: ToastRequest[] = []
  for (const event of events) {
    const notice = noticeFor(event, ctx)
    if (notice) notices.push(notice)
  }
  return notices
}

function noticeFor(event: UiEvent, ctx: NoticeContext): ToastRequest | null {
  switch (event.kind) {
    case 'thread-state':
      if (!ctx.wasRunning) return null
      if (event.state === 'done') return { tone: 'ok', text: 'thread finished', label: 'view' }
      if (event.state === 'failed') {
        return { tone: 'error', text: `thread failed — ${event.reason ?? 'no reason given'}`, label: 'view' }
      }
      return null

    // An approval blocks the agent until it is answered. In a thread nobody is
    // watching, that is a turn stopped dead with nothing on screen to say so.
    case 'approve':
      return { tone: 'info', text: `approval needed — ${event.command}`, label: 'view' }

    case 'compaction-done':
      return {
        tone: 'info',
        text: `context compacted ${event.beforePercent}% → ${event.afterPercent}%`,
        label: 'view',
      }

    default:
      return null
  }
}
