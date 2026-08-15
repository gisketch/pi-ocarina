<script lang="ts">
  import Message from './Message.svelte'
  import Ledger from './Ledger.svelte'
  import AskCard from './AskCard.svelte'
  import ApproveCard from './ApproveCard.svelte'
  import Checkpoint from './Checkpoint.svelte'
  import Compaction from './Compaction.svelte'
  import QueuedSteer from './QueuedSteer.svelte'
  import RawBlock from './RawBlock.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { collapsedBefore, type Block } from '$lib/thread'

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
</script>

{#each shown as block (block.id)}
  {#if block.kind === 'user'}
    <Message role="user" text={block.text} />
  {:else if block.kind === 'agent'}
    <Message role="agent" text={block.text} streaming={block.streaming} />
  {:else if block.kind === 'ledger'}
    <Ledger rows={block.rows} />
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
  {:else if block.kind === 'checkpoint'}
    <Checkpoint
      label={block.label}
      onrestore={wired ? () => threads.restore(threadId, block.id) : undefined}
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
{/each}
