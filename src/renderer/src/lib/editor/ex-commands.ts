/** The `:` commands a buffer column answers, as pure data (spec D2, D5).
 *
 *  No CodeMirror in this file, on purpose twice over: the vim plugin cannot
 *  even be imported outside a browser, and the commands' meaning — what `:wq`
 *  does, what `!` forces — is the part worth testing headlessly. `editor.ts`
 *  registers these against the real `Vim` object; tests drive them with a
 *  fake bag and no DOM. */

/** What a buffer column can do for an ex command. `save` resolves true when
 *  the write landed — `:wq` quits only then, so a stale-write refusal leaves
 *  the column open with the refusal showing. */
export interface ExBag {
  save(force: boolean): Promise<boolean>
  quit(force: boolean): void
  quitAll(force: boolean): void
}

export interface ExCommand {
  /** The full name vim matches by prefix. */
  name: string
  /** The short name it is registered under, when it has one. */
  prefix?: string
  run(bag: ExBag, force: boolean): Promise<void>
}

/** Whether the typed command carried a `!`. The dispatcher parses the name
 *  with `/^(\w+)/` and leaves the bang at the head of `argString`. */
export function isForced(argString: string | undefined): boolean {
  return /^\s*!/.test(argString ?? '')
}

export const EX_COMMANDS: readonly ExCommand[] = [
  {
    name: 'write',
    prefix: 'w',
    run: async (bag, force) => {
      await bag.save(force)
    },
  },
  {
    name: 'quit',
    prefix: 'q',
    run: async (bag, force) => {
      bag.quit(force)
    },
  },
  {
    name: 'wq',
    run: async (bag, force) => {
      // Written first, closed only if the write landed. The quit itself is
      // then unconditional: the buffer was clean the moment the save resolved.
      if (await bag.save(force)) bag.quit(true)
    },
  },
  {
    name: 'qall',
    prefix: 'qa',
    run: async (bag, force) => {
      bag.quitAll(force)
    },
  },
]
