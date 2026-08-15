<script lang="ts">
  import Message from './Message.svelte'
  import Ledger from './Ledger.svelte'
  import AskCard from './AskCard.svelte'
  import ApproveCard from './ApproveCard.svelte'
  import Checkpoint from './Checkpoint.svelte'
  import Compaction from './Compaction.svelte'
  import QueuedSteer from './QueuedSteer.svelte'
  import RawBlock from './RawBlock.svelte'
  import type { Block } from '$lib/thread'

  const { blocks }: { blocks: Block[] } = $props()
</script>

{#each blocks as block (block.id)}
  {#if block.kind === 'user'}
    <Message role="user" text={block.text} />
  {:else if block.kind === 'agent'}
    <Message role="agent" text={block.text} streaming={block.streaming} />
  {:else if block.kind === 'ledger'}
    <Ledger rows={block.rows} />
  {:else if block.kind === 'ask'}
    <AskCard question={block.question} options={block.options} answered={block.answeredIndex} />
  {:else if block.kind === 'approve'}
    <ApproveCard command={block.command} note={block.note} outcome={block.outcome} />
  {:else if block.kind === 'checkpoint'}
    <Checkpoint label={block.label} />
  {:else if block.kind === 'compaction'}
    <Compaction
      running={block.running}
      beforePercent={block.beforePercent}
      afterPercent={block.afterPercent}
      summary={block.summary}
    />
  {:else if block.kind === 'steer'}
    <QueuedSteer text={block.text} />
  {:else if block.kind === 'raw'}
    <RawBlock rawKind={block.rawKind} detail={block.detail} />
  {/if}
{/each}
