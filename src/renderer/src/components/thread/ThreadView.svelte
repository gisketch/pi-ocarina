<script lang="ts">
  import type { ThreadId } from '../../../../shared/thread-id'
  import Message from './Message.svelte'
  import Ledger from './Ledger.svelte'
  import AskCard from './AskCard.svelte'
  import ApproveCard from './ApproveCard.svelte'
  import AgentLabel from './AgentLabel.svelte'
  import Compaction from './Compaction.svelte'
  import QueuedSteer from './QueuedSteer.svelte'
  import RawBlock from './RawBlock.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import BlockMenu from './BlockMenu.svelte'
  import TurnAccordion from './TurnAccordion.svelte'
  import { reasoningOpen } from '$lib/state/reasoning.svelte'
  import { visibleBlocks } from '$lib/thread-rows'
  import {
    accordionDrawn,
    accordionNavId,
    accordionShown,
    lastTurnIdOf,
    turnResolved,
    turnsOf,
    type TurnItem,
  } from '$lib/turn-accordion'
  import { toolOpen } from '$lib/state/tool-open.svelte'
  import { blockFocus, navTarget } from '$lib/state/block-focus.svelte'
  import { blockMenu } from '$lib/state/block-menu.svelte'
  import { leap } from '$lib/state/leap.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { app } from '$lib/state/app.svelte'
  import { askKeys } from '$lib/state/ask-keys.svelte'
  import type { Block } from '$lib/thread'
  import { marksTurnStart } from '$lib/thread-turn'

  interface Props {
    threadId: ThreadId
    blocks: Block[]
  }

  const { threadId, blocks }: Props = $props()

  // Demo columns are recorded, not running: there is no thread behind them for
  // a command to reach. Their cards render without controls rather than
  // offering buttons that would fail against a thread the backend never had.
  const wired = $derived(catalog.source === 'live')
  // A child agent's sigil borrows the workspace's hue, so a child reads as
  // belonging where it runs rather than as a fifth colour in the column.
  const hue = $derived(app.workspace.hue)

  // A compaction folds pi's context, never the reader's transcript: every
  // block above the divider stays exactly where it was. Hiding them behind the
  // card was tried and read as the app deleting the conversation.
  // `o` takes the thinking out of the transcript, not merely out of view: a
  // row left in place with its contents hidden still holds the space it stood
  // in, and a reader who asked for the thinking to be gone gets a column of
  // gaps where it was.
  // `visibleBlocks` is memoized and shared with the nav model, so the two can
  // never disagree about what is drawn — and a streamed token that touched one
  // ledger hands every other block back with its identity intact.
  const shown = $derived(reasoningOpen.shown ? blocks : visibleBlocks(blocks))

  // Which blocks open a turn's worth of agent work. pi splits one turn across
  // several messages and interleaves tool calls between them, so the name is
  // said once, above the first thing the agent did, rather than once per
  // message — which is what made a four-tool turn read as four separate PIs.
  const opensTurn = $derived(marksTurnStart(shown))

  // Null until the reader starts navigating. That is what keeps a column
  // nobody has touched looking exactly as it always did.
  const focused = $derived(blockFocus.idOf(threadId))
  /** The whole model: the accordion reads `turn`, `spans` and `runState`. */
  const model = $derived(threads.get(threadId))

  // The turn accordion's projection (spec 2026-08-21): one collapsed row per
  // finished turn, the opener and the answer outside it. Same list, same
  // blocks — a visibility toggle, never a layout.
  type Turn = Extract<TurnItem, { kind: 'turn' }>
  const items = $derived(turnsOf(shown))
  const lastTurn = $derived(lastTurnIdOf(shown))
  /** Each block's position in `shown`, which is what `opensTurn` indexes. */
  const at = $derived(new Map(shown.map((block, index) => [block, index])))

  const resolvedOf = (turn: Turn): boolean => turnResolved(turn, lastTurn, model.runState)
  const openOf = (turn: Turn): boolean =>
    accordionShown(turn, resolvedOf(turn), (fallback) =>
      toolOpen.isOpen(threadId, accordionNavId(turn.id), fallback),
    )
  /** The clock a header draws: the live one while it runs, the filed one
   *  after. A replayed turn has neither, and its row says only `worked`. */
  const spanOf = (turn: Turn) =>
    resolvedOf(turn) ? model.spans?.[turn.id] : (model.turn ?? model.spans?.[turn.id])

  // Compared against the block, not the nav id: a message splits into segments
  // whose ids are `${blockId}#n`, and matching those against the block id put
  // `.dim` on the wrapper of the very message the ring was inside. The dim
  // remaps colour tokens, which inherit, so the focused segment went out with
  // everything else and the column had nothing lit in it at all.

  /** A message registers its own stops, one per segment, so the wrapper must
   *  never also claim the block id — two elements answering to one ring means
   *  the leap walks the same text twice and `revealBlock` picks whichever the
   *  registry happened to keep. */
  const owns = (block: Block): boolean => block.kind !== 'user' && block.kind !== 'agent'

  /** Cards only. A message renders the menu inside the segment the ring is on,
   *  because a menu pinned to the top of a screen-tall answer opens nowhere
   *  near the block being pointed at. */
  const menuOn = (block: Block): boolean =>
    owns(block) &&
    blockMenu.open &&
    blockMenu.threadId === threadId &&
    blockMenu.block?.id === block.id

  /** Whether this wrapper contains the open menu, wherever it is drawn.
   *
   *  Separate from `menuOn` on purpose. The wrapper is the column's direct
   *  child, so it is the element carrying `content-visibility: auto` and the
   *  paint containment that comes with it — and paint containment clips every
   *  descendant, however deep. A message draws the menu inside its own
   *  segment, so the escape has to be lifted here even though the render
   *  happens two levels down. Lifting it only where the menu renders is the
   *  same half-fix the ledger already made once. */
  const hosts = (block: Block): boolean =>
    blockMenu.open && blockMenu.threadId === threadId && blockMenu.block?.blockId === block.id
</script>

<!-- Keyed on kind and id together, because that is what identifies a block: the
     reducer already looks blocks up that way, since one backend entry can
     produce two of them. Keying on the id alone makes a collision fatal — the
     list throws, and Svelte abandons every update queued behind it, which
     strands unrelated chrome mid-frame. -->
{#snippet blockView(block: Block, labelled: boolean)}
  {@const i = at.get(block) ?? -1}
  {#if labelled && opensTurn[i]}
    <!-- The name is not a block anyone can point at, so while the ring is out
         it is always the quiet half of the contrast. -->
    <div class="turn"><AgentLabel /></div>
  {/if}
  {#if block.kind === 'ledger'}
    <!-- A ledger is not one thing to point at: each of its rows is. It draws
         its own rings, so the wrapper below would only dim the whole spine. -->
    <Ledger
      rows={block.rows}
      {threadId}
      blockId={block.id}
      focusedNav={focused}
      {hue}
    />
  {:else if block.kind === 'checkpoint'}
    <!-- Nothing is drawn. A checkpoint is a place in the session, not a thing
         in the conversation; the message it belongs to carries it, and the
         block menu is where restoring it lives. -->
  {:else}
    <div
      class="nav"
      class:lit={focused === block.id}
      class:hosting={hosts(block)}
      use:navTarget={{ threadId, navId: owns(block) ? block.id : null }}
    >
      {#if menuOn(block)}
        <BlockMenu />
      {/if}
      {#if block.kind === 'user'}
        <Message
          role="user"
          text={block.text}
          attachments={block.attachments}
          {threadId}
          blockId={block.id}
          focusedNav={focused}
            />
      {:else if block.kind === 'agent'}
        <Message
          role="agent"
          text={block.text}
          streaming={block.streaming}
          labelled={false}
          {threadId}
          blockId={block.id}
          focusedNav={focused}
            />
      {:else if block.kind === 'ask'}
        <AskCard
          askId={block.id}
          focused={app.mode !== 'CHAT' && askKeys.focused(threadId, block.id)}
          questions={block.questions}
          outcome={block.outcome}
          answers={block.answers}
          said={block.said}
          reason={block.reason}
          onanswer={wired ? (answers) => threads.answer(threadId, block.id, answers) : undefined}
        />
      {:else if block.kind === 'approve'}
        <ApproveCard
          command={block.command}
          note={block.note}
          agent={block.agent}
          outcome={block.outcome}
          onresolve={wired
            ? (outcome) => threads.resolveApproval(threadId, block.id, outcome)
            : undefined}
        />
      {:else if block.kind === 'compaction'}
        <Compaction
          running={block.running}
          beforePercent={block.beforePercent}
          afterPercent={block.afterPercent}
          tokensSaved={block.tokensSaved}
          skipped={block.skipped}
        />
      {:else if block.kind === 'steer'}
        <QueuedSteer
          text={block.text}
          oncancel={wired ? () => threads.cancelSteer(threadId, block.id) : undefined}
        />
      {:else if block.kind === 'raw'}
        <RawBlock rawKind={block.rawKind} detail={block.detail} />
      {/if}
    </div>
  {/if}
{/snippet}

{#each items as item (item.kind === 'turn' ? `t:${item.id}` : `${item.block.kind}:${item.block.id}`)}
  {#if item.kind === 'block'}
    {@render blockView(item.block, true)}
  {:else}
    {@const resolved = resolvedOf(item)}
    {@const open = openOf(item)}
    {@render blockView(item.opener, false)}
    {#if accordionDrawn(item, resolved)}
      <!-- The header is the turn's whole byline: it ticks while the turn
           runs — the role the old footer played — and is the collapsed row
           after. No `PI` label above it; the sigil on the row says who.
           `accordionDrawn` is the same presence rule the stop list obeys. -->
      <TurnAccordion
        turnId={item.id}
        {threadId}
        span={spanOf(item)}
        {resolved}
        {open}
        focusedNav={focused}
        workspaceName={app.workspace.name}
        {hue}
      />
    {:else if item.final.length > 0}
      <!-- A turn that answered without working draws no header, so the name
           still has to be said above the answer. -->
      <div class="turn"><AgentLabel /></div>
    {/if}
    {#if open}
      {#each item.inner as block (`${block.kind}:${block.id}`)}
        {@render blockView(block, false)}
      {/each}
    {/if}
    {#each item.final as block (`${block.kind}:${block.id}`)}
      {@render blockView(block, false)}
    {/each}
  {/if}
{/each}

<style>
  /* The band is the whole of the navigation's appearance — one signal for one
     state, and no geometry, so the focused block does not shift the text it is
     marking. */
  .nav {
    position: relative;
    /* Blocks are independent of one another, so lighting one never
       re-lays-out the rest of the thread. */
    contain: layout style;
  }
  /* The column gives every block `content-visibility: auto`, which brings paint
     containment with it — and paint containment clips descendants to the
     padding box. A menu is taller than the one-line message it hangs off, so
     without this its lower rows and its whole confirm panel are sliced off. */
  .nav.hosting {
    content-visibility: visible;
    contain: none;
    z-index: 5;
  }
</style>
