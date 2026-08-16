/** What quitting on top of running work says.
 *
 *  Shared because both sides ask it: the app's own confirm modal normally, and
 *  main's platform dialog when the renderer cannot answer. Two wordings for
 *  one question would make the fallback look like a different question. */
export function quitMessage(running: number): { message: string; detail: string } {
  const threads = running === 1 ? 'thread is' : 'threads are'
  return {
    message: `${running} ${threads} still working.`,
    detail: 'Quitting stops them. Their transcripts are saved either way.',
  }
}
