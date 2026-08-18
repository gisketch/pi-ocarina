/** The one file the reader writes by hand.
 *
 *  Keys, hooks and approval rules live here together. They share a property
 *  that nothing else in the app does: each is hand-authored, read at launch, and
 *  meaningless for the app to write. The catalog is the opposite — the app
 *  rewrites it constantly, so a hand-edit there would die at the next save.
 *  Who edits it owns it.
 *
 *  Everything is validated per entry. A bad binding costs its own line and
 *  nothing else: the neighbours load, the app starts, and the problem is
 *  reported where the reader can read it after the banner is gone. */

/** A key bound to one of the app's actions. Which names are actions is the
 *  keyboard's business, not this file's — the parser checks shape, and the
 *  keymap checks meaning. */
export interface KeyBinding {
  /** The mode it applies in. */
  mode: 'NORMAL' | 'READ' | 'DIFF' | 'LEADER'
  key: string
  action: string
}

/** When a hook runs.
 *
 *  Three points, not one per tool call. A hook on every call spawns a process
 *  per read, and the reader who wanted a formatter gets a hundred processes a
 *  turn. `edit.after` fires once per turn, after the last edit — a formatter run
 *  three times for one turn's three edits is three times the cost of one
 *  result. */
export type HookPoint = 'turn.start' | 'turn.end' | 'edit.after'

export const HOOK_POINTS: readonly HookPoint[] = ['turn.start', 'turn.end', 'edit.after']

export interface HookEntry {
  on: HookPoint
  /** Run without a shell, in the workspace. */
  command: string
  /** Milliseconds before it is killed. */
  timeoutMs?: number
}

/** An approval rule. `deny` always beats `allow`, and neither can reach a
 *  protected path. */
export interface RuleEntry {
  effect: 'allow' | 'deny'
  /** The tool it covers: `bash`, `write`, `edit`, or `*`. */
  tool: string
  /** A prefix the tool's subject must start with. `pnpm test` covers
   *  `pnpm test --watch`; a path covers everything under it. */
  match: string
  /** Absent means every workspace. */
  workspace?: string
}

export interface AppConfig {
  keys: KeyBinding[]
  hooks: HookEntry[]
  rules: RuleEntry[]
}

export const EMPTY_CONFIG: AppConfig = { keys: [], hooks: [], rules: [] }

/** One entry that did not load, and why. Never a thrown error: a file with one
 *  bad line still has good lines in it. */
export interface ConfigProblem {
  where: string
  message: string
}

export interface ConfigLoad {
  config: AppConfig
  problems: ConfigProblem[]
}

const MODES = new Set(['NORMAL', 'READ', 'DIFF', 'LEADER'])

/** Keys that cannot be rebound.
 *
 *  Recoverability, not taste. A reader who rebinds `j` has a worse day. A reader
 *  who rebinds `Escape` has an app they cannot leave, and the fix is editing a
 *  file they cannot open because the app is holding the keyboard.
 *
 *  The list is the keys that *enter or leave a mode*, checked against the
 *  reducer rather than guessed: `Escape` leaves every mode, `i` enters INSERT,
 *  `d` enters DIFF, `j`/`k` enter READ, `t` opens a terminal column and `␣`
 *  starts the leader chord. Take any of those and a whole mode becomes
 *  unreachable — and the app has no other door to it. Earlier versions of this
 *  list protected `:` and `v`, which nothing reads, while leaving every key
 *  above rebindable. */
export const FIXED_KEYS = new Set(['Escape', 'i', 'd', 'j', 'k', 't', ' '])

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readKeys(value: unknown, problems: ConfigProblem[]): KeyBinding[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    problems.push({ where: 'keys', message: 'expected a list of bindings' })
    return []
  }

  const kept: KeyBinding[] = []
  const seen = new Map<string, number>()

  value.forEach((raw, index) => {
    const where = `keys[${index}]`
    const entry = (raw ?? {}) as Record<string, unknown>
    const mode = str(entry.mode).toUpperCase()
    const key = typeof entry.key === 'string' ? entry.key : ''
    const action = str(entry.action)

    if (!MODES.has(mode)) {
      problems.push({ where, message: `unknown mode: ${str(entry.mode) || '(none)'}` })
      return
    }
    if (key === '') {
      problems.push({ where, message: 'no key' })
      return
    }
    if (action === '') {
      problems.push({ where, message: 'no action' })
      return
    }
    if (FIXED_KEYS.has(key)) {
      problems.push({
        where,
        message: `${key} cannot be rebound — it is how you leave a mode`,
      })
      return
    }

    const slot = `${mode} ${key}`
    const first = seen.get(slot)
    if (first !== undefined) {
      // Both are dropped rather than one winning silently. A collision means
      // the reader believes two things, and the app cannot know which.
      problems.push({ where, message: `${slot} is bound twice — both dropped` })
      problems.push({ where: `keys[${first}]`, message: `${slot} is bound twice — both dropped` })
      const at = kept.findIndex((one) => one.mode === mode && one.key === key)
      if (at !== -1) kept.splice(at, 1)
      return
    }

    seen.set(slot, index)
    kept.push({ mode: mode as KeyBinding['mode'], key, action })
  })

  return kept
}

function readHooks(value: unknown, problems: ConfigProblem[]): HookEntry[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    problems.push({ where: 'hooks', message: 'expected a list of hooks' })
    return []
  }

  const kept: HookEntry[] = []
  value.forEach((raw, index) => {
    const where = `hooks[${index}]`
    const entry = (raw ?? {}) as Record<string, unknown>
    const on = str(entry.on) as HookPoint
    const command = str(entry.command)

    if (!HOOK_POINTS.includes(on)) {
      problems.push({ where, message: `unknown point: ${str(entry.on) || '(none)'}` })
      return
    }
    if (command === '') {
      problems.push({ where, message: 'no command' })
      return
    }

    const timeout = entry.timeoutMs
    kept.push({
      on,
      command,
      ...(typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0
        ? { timeoutMs: timeout }
        : {}),
    })
  })
  return kept
}

function readRules(value: unknown, problems: ConfigProblem[]): RuleEntry[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    problems.push({ where: 'rules', message: 'expected a list of rules' })
    return []
  }

  const kept: RuleEntry[] = []
  value.forEach((raw, index) => {
    const where = `rules[${index}]`
    const entry = (raw ?? {}) as Record<string, unknown>
    const effect = str(entry.effect)
    const tool = str(entry.tool)
    const match = str(entry.match)

    if (effect !== 'allow' && effect !== 'deny') {
      problems.push({ where, message: `effect must be allow or deny` })
      return
    }
    if (tool === '') {
      problems.push({ where, message: 'no tool' })
      return
    }
    if (match === '') {
      problems.push({ where, message: 'no match — a rule covering everything is not a rule' })
      return
    }

    const workspace = str(entry.workspace)
    kept.push({ effect, tool, match, ...(workspace !== '' ? { workspace } : {}) })
  })
  return kept
}

/** Reads the file's text. Never throws.
 *
 *  A file that is not valid JSON is one problem, not a broken launch: the app
 *  starts on its defaults and says which file to look at. */
export function parseConfig(text: string): ConfigLoad {
  const problems: ConfigProblem[] = []

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (cause) {
    return {
      config: EMPTY_CONFIG,
      problems: [
        { where: 'file', message: `not valid JSON — ${cause instanceof Error ? cause.message : ''}` },
      ],
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { config: EMPTY_CONFIG, problems: [{ where: 'file', message: 'expected an object' }] }
  }

  const record = raw as Record<string, unknown>
  return {
    config: {
      keys: readKeys(record.keys, problems),
      hooks: readHooks(record.hooks, problems),
      rules: readRules(record.rules, problems),
    },
    problems,
  }
}
