/** Which keys xterm is allowed to handle while the shell has the caret.
 *
 *  Everything, except the one key the shell reserves. xterm handles Escape
 *  itself and stops it before it reaches the window, which left the mode
 *  machine blind to the only key that leaves TERM — and made the `esc esc`
 *  chord unreachable, since its second half never arrived either.
 *
 *  Declining the key here does not swallow it: it propagates normally, and the
 *  shell decides whether it means "leave TERM" or, pressed twice, "send a real
 *  escape through". */
export function xtermShouldHandle(event: { key: string }): boolean {
  return event.key !== 'Escape'
}
