<script lang="ts">
  /** The files staged for the next prompt, above the composer.
   *
   *  Its own component because it is a complete thing — the row, its chips and
   *  the one button that undoes staging — and because it is the second place
   *  chips are drawn. The first is the sent message; keeping the shape here
   *  means the two cannot drift into looking like different ideas. */
  import { attachments } from '$lib/state/attachments.svelte'

  const chips = $derived(attachments.list)
</script>

{#if chips.length > 0}
  <div class="chips">
    {#each chips as attachment (attachment.path)}
      <span class="chip" class:image={(attachment.mime ?? '').startsWith('image/')}>
        <span class="glyph">▤</span>{attachment.name}
        <button
          type="button"
          class="drop"
          aria-label="remove {attachment.name}"
          onclick={() => attachments.remove(attachment.path)}>✕</button
        >
      </span>
    {/each}
  </div>
{/if}

<style>
  .chips {
    max-width: var(--column-w);
    margin: 0 auto 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    border: 1px solid var(--line-strong);
    background: var(--bg-hover);
    padding: 2px 8px;
    font-size: 11px;
    font-family: var(--font-body);
    color: var(--fg-agent);
  }
  .chip.image {
    border-color: oklch(0.76 0.14 var(--accent-hue) / 0.5);
  }
  .glyph {
    color: var(--fg-dim);
  }
  .chip.image .glyph {
    color: var(--accent);
  }
  .drop {
    background: none;
    border: none;
    padding: 0;
    color: var(--fg-dimmest);
    font: inherit;
    font-size: 10px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .drop:hover {
    color: var(--err);
  }
</style>
