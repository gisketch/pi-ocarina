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
  import { threads } from '$lib/state/threads.svelte'
  import { collapsedBefore, type Block } from '$lib/thread'
  import { marksTurnStart } from '$lib/thread-turn'

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

  // While hints are up the dim comes off: every label must be readable, and a
  // half-faded one reads as "not a destination".
  const hinting = $derived(blockFocus.leap?.threadId === threadId)

  /** Whether the menu is open on this exact block. */
  const menuOn = (navId: string): boolean =>
    blockMenu.open && blockMenu.threadId === threadId && blockMenu.block?.id === navId
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
    <div class="turn" class:dim={focused !== null}><AgentLabel /></div>
  {/if}
  {#if block.kind === 'ledger'}
    <!-- A ledger is not one thing to point at: each of its rows is. It draws
         its own rings, so the wrapper below would only dim the whole spine. -->
    <Ledger
      rows={block.rows}
      {threadId}
      blockId={block.id}
      focusedNav={focused}
      dimmed={focused !== null && !hinting}
    />
  {:else if block.kind === 'checkpoint'}
    <!-- Nothing is drawn. A checkpoint is a place in the session, not a thing
         in the conversation; the message it belongs to carries it, and the
         block menu is where restoring it lives. -->
  {:else}
    <div
      class="nav"
      class:dim={focused !== null && focused !== block.id && !hinting}
      class:hosting={menuOn(block.id)}
      use:navTarget={{ threadId, navId: block.id }}
    >
      {#if blockFocus.labelOf(threadId, block.id)}
        <span class="hint">{blockFocus.labelOf(threadId, block.id)}</span>
      {/if}
      {#if menuOn(block.id)}
        <BlockMenu />
      {/if}
      {#if block.kind === 'user'}
        <Message role="user" text={block.text} />
      {:else if block.kind === 'agent'}
        <Message role="agent" text={block.text} streaming={block.streaming} labelled={false} />
      {:else if block.kind === 'ask'}
        <AskCard
          question={block.question}
          options={block.options}
          answered={block.answeredIndex}
          onanswer={wired ? (index) => threads.answer(threadId, block.id, index) : undefined}
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
     gap far more than opacity can on its own: a green PI label or a red failed
     tool row still pulls the eye at half brightness, and the whole point of
     the dim is that it should not. */
  .nav.dim,
  .turn.dim {
    opacity: 0.5;
    filter: grayscale(1);
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
  /* Over the block's own top-left rather than beside it: the column is narrow,
     and a gutter wide enough for a label would cost every block the width. */
  .hint {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    background: var(--accent);
    color: var(--bg);
    font-family: var(--font-chrome);
    font-size: 10px;
    line-height: 1;
    padding: 2px 4px;
    pointer-events: none;
  }
</style>
