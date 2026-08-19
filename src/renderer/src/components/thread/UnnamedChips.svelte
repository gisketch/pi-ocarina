<script lang="ts">
  /** Files a message carried but never mentioned.
   *
   *  Chips after the text rather than a paragraph describing them — the same
   *  chip the sentence would have used, in the only place left to put it. */
  import Chip from '../Chip.svelte'
  import { fileIcon } from '$lib/icons'
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
      <!-- The picker's own answer, so the same file wears the same mark
           everywhere it appears. -->
      <Chip
        icon={fileIcon(attachment.name)}
        label={attachment.name}
        onclick={() => onopen(attachment.name)}
      />
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
</style>
