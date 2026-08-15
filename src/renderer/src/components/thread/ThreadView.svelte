<script lang="ts">
  import Message from './Message.svelte'
  import Ledger from './Ledger.svelte'
  import AskCard from './AskCard.svelte'
  import ApproveCard from './ApproveCard.svelte'
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
    <AskCard question={block.question} options={block.options} />
  {:else if block.kind === 'approve'}
    <ApproveCard command={block.command} note={block.note} />
  {/if}
{/each}
