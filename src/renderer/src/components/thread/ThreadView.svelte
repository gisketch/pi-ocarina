<script lang="ts">
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
  import { blockFocus, navTarget } from '$lib/state/block-focus.svelte'
  import { blockMenu } from '$lib/state/block-menu.svelte'
  import { leap } from '$lib/state/leap.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { askKeys } from '$lib/state/ask-keys.svelte'
  import { collapsedBefore, type Block } from '$lib/thread'
  import { labelOwning, marksTurnStart } from '$lib/thread-turn'
  import { navBlocks } from '$lib/blocks'

  interface Props {
    threadId: string
    blocks: Block[]
  }

  const { threadId, blocks }: Props = $props()

  // Demo columns are recorded, not running: there is no thread behind them for
  // a command to reach. Their cards render without controls rather than
  // offering buttons that would fail against a thread the backend never had.
  const wired = $derived(catalog.source === 'live')

  // A finished compaction stands where the history it replaced used to be, so
  // the blocks above it collapse behind it until the reader asks for them.
  const cut = $derived(collapsedBefore(blocks))
  // Keyed by which compaction is doing the collapsing: a second compaction
  // later in the thread starts collapsed again rather than inheriting the
  // first one's expansion.
  let expandedFor = $state<string | null>(null)
  const marker = $derived(cut > 0 ? (blocks[cut]?.id ?? null) : null)
  const hidden = $derived(marker !== null && expandedFor !== marker ? cut : 0)
  const shown = $derived(hidden === 0 ? blocks : blocks.slice(hidden))

  // Which blocks open a turn's worth of agent work. pi splits one turn across
  // several messages and interleaves tool calls between them, so the name is
  // said once, above the first thing the agent did, rather than once per
  // message — which is what made a four-tool turn read as four separate PIs.
  const opensTurn = $derived(marksTurnStart(shown))

  // Null until the reader starts navigating. That is what keeps a column
  // nobody has touched looking exactly as it always did: no ring, no dim.
  const focused = $derived(blockFocus.idOf(threadId))

  // A leap mutes the whole column at the column's own level, by colour. The
  // opacity dim stands down while it does: stacking the two would take the
  // match paint down with the text, because a highlight cannot escape an
  // ancestor's opacity.
  const leaping = $derived(leap.activeFor(threadId))
  const dimming = $derived(!leaping && focused !== null)

  // Which block the ring is on — a tool row reports its ledger, since the name
  // above a turn belongs to the whole turn and not to one row of it.
  //
  // Guarded on there being a ring at all. `navBlocks` walks the whole thread,
  // and `shown` changes on every token of a streaming turn: without the guard
  // a five-thousand-block thread rebuilds five thousand entries per token, to
  // answer a question nobody is asking while nothing is focused.
  const focusedBlock = $derived(
    focused === null ? null : (navBlocks(shown).find((entry) => entry.id === focused)?.blockId ?? null),
  )

  // The agent name that introduces the focused block, so it stays lit with it.
  const litLabel = $derived(labelOwning(shown, opensTurn, focusedBlock))

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
{#each shown as block, i (`${block.kind}:${block.id}`)}
  {#if opensTurn[i]}
    <!-- The name is not a block anyone can point at, so while the ring is out
         it is always the quiet half of the contrast. -->
    <div class="turn" class:dim={dimming && i !== litLabel}><AgentLabel /></div>
  {/if}
  {#if block.kind === 'ledger'}
    <!-- A ledger is not one thing to point at: each of its rows is. It draws
         its own rings, so the wrapper below would only dim the whole spine. -->
    <Ledger
      rows={block.rows}
      {threadId}
      blockId={block.id}
      focusedNav={focused}
      dimmed={dimming}
    />
  {:else if block.kind === 'checkpoint'}
    <!-- Nothing is drawn. A checkpoint is a place in the session, not a thing
         in the conversation; the message it belongs to carries it, and the
         block menu is where restoring it lives. -->
  {:else}
    <div
      class="nav"
      class:dim={dimming && focusedBlock !== block.id}
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
          {threadId}
          blockId={block.id}
          focusedNav={focused}
          dimmed={dimming}
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
          dimmed={dimming}
        />
      {:else if block.kind === 'ask'}
        <AskCard
          askId={block.id}
          focused={askKeys.focused(threadId, block.id)}
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
          summary={block.summary}
          skipped={block.skipped}
          hidden={block.id === marker ? cut : 0}
          collapsed={block.id === marker && hidden > 0}
          ontoggle={() => (expandedFor = expandedFor === marker ? null : marker)}
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
{/each}

<style>
  /* The dim is the whole of the navigation's appearance — one signal for one
     state, and no geometry, so the focused block does not shift the text it is
     marking. Opacity composes on the GPU, so walking a long transcript never
     asks for a layout pass. */
  .nav {
    position: relative;
    transition: opacity 0.12s ease;
    /* Blocks are independent of one another, so dimming one never re-lays-out
       the rest of the thread. */
    contain: layout style;
  }
  /* Colour is the focused block's alone. Draining it from the rest widens the
     gap far more than brightness can on its own: a green PI label or a red
     failed tool row still pulls the eye when it is only faded.

     Done by re-pointing the colour tokens rather than with `opacity` and
     `filter`, for two reasons. Those two cost real paint — measured at about a
     third more per frame on a five-thousand-block thread — and they take any
     overlay down with them, which is how the leap's match paint ended up grey.
     One mechanism for both, and neither problem. */
  .nav.dim,
  .turn.dim {
    --tone-1: var(--fg-dimmer);
    --tone-2: var(--fg-dimmer);
    --tone-3: var(--fg-dimmer);
    --fg-bright: var(--fg-dimmer);
    --fg-body: var(--fg-dimmer);
    --fg: var(--fg-dimmer);
    --fg-agent: var(--fg-dimmer);
    --fg-muted: var(--fg-dimmer);
    --fg-dim: var(--fg-dimmer);
    --fg-dimmest: var(--fg-dimmer);
    --accent: var(--fg-dimmer);
    --ok: var(--fg-dimmer);
    --ok-text: var(--fg-dimmer);
    --err: var(--fg-dimmer);
    --err-text: var(--fg-dimmer);
    --warn: var(--fg-dimmer);
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
