/** A named voice, held in the system prompt.
 *
 *  The difference between this and asking in a message is where the text lives.
 *  A message decays: twenty turns of tool output push it out of the model's
 *  attention, and a compaction can drop it entirely. The system prompt is
 *  re-sent whole on every request and survives compaction. That is the whole
 *  reason this is a feature rather than a habit.
 *
 *  A mode is not an `AgentRole`. A role says what a child agent is and which
 *  tools it may touch; it is chosen per spawn and scopes capability. A mode is
 *  ambient, applies to the thread the reader is reading, and scopes voice. */

export interface ChatMode {
  id: string
  name: string
  instructions: string
}

/** Appended after the reader's own prose, and not removable by it.
 *
 *  The hazard a mode carries is not a clash of formatting. It is a voice
 *  instruction bleeding into behavior — "drop everything unnecessary" read as
 *  permission to skip a verification. A setting named for voice must not be
 *  able to change what the agent does, so the app says so itself, in the same
 *  place `CHILD_PREAMBLE` says what a subagent is. */
export const MODE_BOUNDARY = [
  'The instruction above governs how you write, not what you do. It never',
  'changes which steps you take, which tools you use, or how carefully you',
  'check your work. If following it would mean leaving something out that the',
  'task needs, keep the work complete and let the wording give way.',
].join(' ')

/** The one mode that ships.
 *
 *  Owner decision. The recommendation had been three neutral examples, on the
 *  reasoning that a shipped default reads as the app's own voice; the owner
 *  wanted the mode they actually use, and one working example teaches the shape
 *  as well as three does.
 *
 *  Written to the boundary above: it constrains sentences, not work. */
export const SHIPPED_MODES: readonly ChatMode[] = [
  {
    id: 'terse',
    name: 'terse',
    instructions: [
      'Write tersely. Drop filler, hedging and pleasantries. Prefer short common',
      'words. Use active voice and name the actor. One idea per sentence, and no',
      'sentence longer than about twenty-five words. Fragments are fine.',
      'Lead with the answer, then the detail.',
      'Keep every technical fact. Code, commands, identifiers, file paths and',
      'error strings are reproduced exactly and are never compressed or',
      'abbreviated. Write normally, not tersely, for safety warnings and for',
      'confirmations of anything hard to undo.',
    ].join(' '),
  },
]

/** The mode in force, from the two places one can be set.
 *
 *  Two levels rather than the three permissions resolve across, and the
 *  asymmetry is deliberate: a permission level is about the code the agent
 *  touches, which is workspace-shaped, and a voice is about the person reading,
 *  who does not change between repositories. A workspace level would store the
 *  same value twice.
 *
 *  A name matching no mode resolves to none. A deleted mode leaves a dangling
 *  pointer somewhere sooner or later, and silence is the right answer to it —
 *  never a crash, and never a stranger's voice. */
export function resolveMode(
  thread: string | undefined,
  global: string | undefined,
  modes: readonly ChatMode[],
): ChatMode | undefined {
  const wanted = thread ?? global
  if (wanted === undefined || wanted === '') return undefined
  return modes.find((mode) => mode.id === wanted)
}

/** What a mode contributes to the system prompt, in order.
 *
 *  Empty when no mode is set, which is what "normal" is: the app appends
 *  nothing and pi behaves as it ships. A `normal` mode carrying prose would be
 *  a positive instruction, costing tokens on every request and pushing the
 *  model away from stock — the opposite of what its name promises. */
export function modePrompt(mode: ChatMode | undefined): string[] {
  if (!mode) return []
  const said = mode.instructions.trim()
  if (said === '') return []
  return [said, MODE_BOUNDARY]
}

/** What the status bar draws. Null when no mode is set, on the rule `lspChip`
 *  already follows: an empty state does not need a word for itself. */
export function modeChip(mode: ChatMode | undefined): string | null {
  return mode ? mode.name : null
}

function isMode(value: unknown): value is ChatMode {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    record.id !== '' &&
    typeof record.name === 'string' &&
    record.name !== '' &&
    typeof record.instructions === 'string'
  )
}

/** Reads a stored list, dropping entries that are not modes.
 *
 *  One bad entry costs its own row and nothing else, which is the same
 *  tolerance the roles and the project's resources get. */
export function parseModes(value: unknown): ChatMode[] {
  if (!Array.isArray(value)) return []
  return value.filter(isMode).map((mode) => ({
    id: mode.id,
    name: mode.name,
    instructions: mode.instructions,
  }))
}
