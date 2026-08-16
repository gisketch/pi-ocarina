<script lang="ts">
  import { leap } from '$lib/state/leap.svelte'

  const { threadId }: { threadId: string } = $props()

  const showing = $derived(leap.activeFor(threadId))
</script>

{#if showing}
  <!-- One layer for the whole column, not a chip inside each block. Blocks
       carry paint containment from `content-visibility: auto`, which would
       slice a chip sitting near an edge in half — the same clip that already
       cost the block menu its lower rows. -->
  <div class="layer">
    {#each leap.targets as target, i (i)}
      {@const label = leap.labelOf(i)}
      {#if label}
        <span class="chip" style:top="{target.top}px" style:left="{target.left}px">{label}</span>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* Positioned in the column's content coordinates, so it scrolls with the
     text it is naming rather than floating over a moving page. */
  .layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 6;
    pointer-events: none;
  }

  /* Over the character the match begins on, which is where the reader is
     already looking. Translated up a hair so the chip's baseline sits with the
     text rather than under it. */
  .chip {
    position: absolute;
    transform: translateY(-1px);
    background: var(--accent);
    color: var(--bg);
    font-family: var(--font-chrome);
    font-size: 10px;
    line-height: 1.3;
    padding: 0 3px;
    white-space: nowrap;
  }
</style>
