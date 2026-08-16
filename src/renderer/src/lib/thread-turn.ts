import type { Block, ThreadViewModel } from './thread'

/** How one turn's worth of agent output is assembled.
 *
 *  A turn is everything since the last thing the user said. pi fills one with
 *  several messages and any number of tool calls, and the reader is owed the
 *  answer rather than pi's accounting of how it was assembled. */

/** Separators, which sit between blocks without belonging to either. */
const BETWEEN: ReadonlySet<Block['kind']> = new Set(['checkpoint', 'compaction', 'steer'])

/** The agent message still being written, or -1.
 *
 *  pi may split one answer across several messages, and the reader is owed the
 *  answer rather than pi's accounting of how it was assembled — so consecutive
 *  messages become one block.
 *
 *  Consecutive is the limit, deliberately. An agent that speaks, works, then
 *  speaks again said two things, and folding the second into the first would
 *  put a summary above the tool calls it is summarising. */
export function turnMessage(blocks: Block[]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const kind = blocks[index].kind
    if (BETWEEN.has(kind)) continue
    return kind === 'agent' ? index : -1
  }
  return -1
}

/** Adds to what the agent has said this turn, starting the block if this is the
 *  first word of it. The block keeps the id of the message that opened it. */
function push(model: ThreadViewModel, block: Block): ThreadViewModel {
  return { ...model, blocks: [...model.blocks, block] }
}

export function growTurnMessage(model: ThreadViewModel, text: string): ThreadViewModel {
  const at = turnMessage(model.blocks)
  if (at === -1) {
    return push(model, { kind: 'agent', id: `turn-${model.blocks.length}`, text, streaming: true })
  }

  const blocks = model.blocks.slice()
  const block = blocks[at] as Extract<Block, { kind: 'agent' }>
  blocks[at] = { ...block, text: block.text + text, streaming: true }
  return { ...model, blocks }
}

/** Ends the streaming caret on the message that was being written.
 *
 *  Not necessarily the last block: a tool call that started while the agent was
 *  mid-sentence puts a ledger after it. Only one message is ever being written,
 *  so the newest streaming one in this turn is the one that just ended. */
export function settleTurnMessage(model: ThreadViewModel): ThreadViewModel {
  for (let index = model.blocks.length - 1; index >= 0; index -= 1) {
    const block = model.blocks[index]
    if (block.kind === 'user') return model
    if (block.kind !== 'agent' || !block.streaming) continue

    const blocks = model.blocks.slice()
    blocks[index] = { ...block, streaming: false }
    return { ...model, blocks }
  }
  return model
}

/** Blocks that belong to nobody: separators and the reader's own controls.
 *  They neither start a turn's agent work nor end it. */
const NEUTRAL_BLOCKS: ReadonlySet<Block['kind']> = new Set(['checkpoint', 'compaction', 'steer'])

/** For each block, whether the agent's name should be said above it.
 *
 *  A turn is everything since the last thing the user said, and pi may fill one
 *  with several messages and any number of tool calls. The name is said once,
 *  above the first thing the agent did in that turn — saying it per message
 *  turned a four-tool turn into four separate agents talking. */
export function marksTurnStart(blocks: Block[]): boolean[] {
  const marks: boolean[] = []
  let inTurn = false

  for (const block of blocks) {
    if (block.kind === 'user') {
      inTurn = false
      marks.push(false)
      continue
    }
    if (NEUTRAL_BLOCKS.has(block.kind)) {
      marks.push(false)
      continue
    }

    marks.push(!inTurn)
    inTurn = true
  }
  return marks
}

/** Which turn-opening block introduces `blockId`, or -1 when none does.
 *
 *  The agent's name is said once above a turn, outside every block in it, so
 *  it has to be told when to light with the focused block. `YOU` needs no such
 *  help: it is drawn inside its own message.
 *
 *  Walking back stops at the reader's own message, because that is where the
 *  turn above it ended. Without that, focusing a `YOU` lights the `PI` of the
 *  turn before it — a name over work the focused block had nothing to do
 *  with. */
export function labelOwning(
  blocks: Block[],
  opensTurn: boolean[],
  blockId: string | null,
): number {
  if (blockId === null) return -1

  const at = blocks.findIndex((block) => block.id === blockId)
  if (at === -1) return -1

  for (let i = at; i >= 0; i -= 1) {
    if (blocks[i]?.kind === 'user') return -1
    if (opensTurn[i]) return i
  }
  return -1
}
