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
    <!-- Keyed by position: two files can share a name — one from each of two
         folders — and a duplicate key throws, which takes every update queued
         behind it with it. -->
    {#each attachments as attachment, i (`${i}:${attachment.name}`)}
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
    padding: 2px 8px;
    background: oklch(0.76 0.14 var(--accent-hue) / 0.15);
    color: var(--accent);
    cursor: pointer;
  }
  .chip:hover {
    background: oklch(0.76 0.14 var(--accent-hue) / 0.24);
  }
</style>
