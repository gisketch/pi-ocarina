<script lang="ts">
  /** Files a message carried but never mentioned.
   *
   *  Chips after the text rather than a paragraph describing them — the same
   *  chip the sentence would have used, in the only place left to put it. */
  import Icon from '../Icon.svelte'
  import type { MessageAttachment } from '$lib/thread'

  const {
    attachments,
    onopen,
  }: { attachments: MessageAttachment[]; onopen: (name: string) => void } = $props()
</script>

{#if attachments.length > 0}
  <div class="row">
    {#each attachments as attachment (attachment.name)}
      <button type="button" class="chip" onclick={() => onopen(attachment.name)}>
        <Icon name={(attachment.mime ?? '').startsWith('image/') ? 'image' : 'file'} />
        {attachment.name}
      </button>
    {/each}
  </div>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: inherit;
    font-size: 11.5px;
    padding: 1px 7px;
    border: 1px solid var(--line-mid);
    background: var(--bg-chip);
    color: var(--accent);
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--accent-soft);
  }
</style>
