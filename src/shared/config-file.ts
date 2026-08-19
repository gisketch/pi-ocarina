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
  /** The mode it applies in. `NORMAL` is accepted in the file as the old
   *  name for `OCARINA` — configs written before the rename keep working —
   *  but is normalized away here, so nothing downstream sees it. */
  mode: 'OCARINA' | 'READ' | 'DIFF' | 'LEADER'
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

/** How threads get their names.
 *
 *  Absent entirely for almost everyone: the titler is on by default and picks
 *  the cheapest model pi has configured. `model` pins it (`provider/id`, the
 *  way pi's own config spells one); `enabled: false` turns the machine naming
 *  off — the manual rename always works. */
export interface TitleSettings {
  model?: string
  enabled?: boolean
}

export interface AppConfig {
  keys: KeyBinding[]
  hooks: HookEntry[]
  rules: RuleEntry[]
  titles: TitleSettings
}

export const EMPTY_CONFIG: AppConfig = { keys: [], hooks: [], rules: [], titles: {} }

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

const MODES = new Set(['OCARINA', 'READ', 'DIFF', 'LEADER'])

/** Old names for modes that were renamed, still honoured in the file.
 *  vim's NORMAL/INSERT are not addressable here (spec D10) — a file saying
 *  NORMAL predates the rename and always meant the strip. */
const MODE_ALIASES: Readonly<Record<string, string>> = { NORMAL: 'OCARINA' }

/** Keys that cannot be rebound.
 *
 *  Recoverability, not taste. A reader who rebinds `j` has a worse day. A reader
 *  who rebinds `Escape` has an app they cannot leave, and the fix is editing a
 *  file they cannot open because the app is holding the keyboard.
 *
 *  One key, decided in the 2026-08-19 rebindable-keymaps spec: `Escape` is
 *  the universal way out — of a mode, an overlay, a recording — and a reader
 *  who loses it has an app they cannot leave. Everything else may move; the
 *  mode-entry keys included, because one fixed exit is enough to stay
 *  recoverable. Earlier versions also fixed `i d j k t ␣`, which left a
 *  non-QWERTY reader unable to move the keys they hit most. */
export const FIXED_KEYS = new Set(['Escape'])

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
    const spelled = str(entry.mode).toUpperCase()
    const mode = MODE_ALIASES[spelled] ?? spelled
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

function readTitles(value: unknown, problems: ConfigProblem[]): TitleSettings {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push({ where: 'titles', message: 'expected an object' })
    return {}
  }

  const entry = value as Record<string, unknown>
  const kept: TitleSettings = {}

  if (entry.model !== undefined) {
    const model = str(entry.model)
    // The same spelling pi's `--model` takes. Checked here so a typo is a
    // reported line, not a titler that silently never runs.
    if (model === '' || !model.includes('/')) {
      problems.push({ where: 'titles.model', message: 'expected "provider/id"' })
    } else {
      kept.model = model
    }
  }

  if (entry.enabled !== undefined) {
    if (typeof entry.enabled !== 'boolean') {
      problems.push({ where: 'titles.enabled', message: 'expected true or false' })
    } else {
      kept.enabled = entry.enabled
    }
  }

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
      titles: readTitles(record.titles, problems),
    },
    problems,
  }
}
