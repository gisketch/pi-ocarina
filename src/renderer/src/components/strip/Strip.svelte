<script lang="ts">
  import ThreadColumn from './ThreadColumn.svelte'
  import FreshThread from './FreshThread.svelte'
  import { app } from '$lib/state/app.svelte'
  import { COLUMN_GAP, COLUMN_WIDTH, stripOffset } from '$lib/strip'

  const workspace = $derived(app.workspace)
  // The strip is pinned at left:50% and slid so the focused column sits centred;
  // one composited transform moves the whole rail of columns.
  const offset = $derived(stripOffset(app.threadIndex))
</script>

<div class="viewport">
  {#key workspace.id}
    <div class="strip" style:transform="translateX({offset}px)" style:gap="{COLUMN_GAP}px">
      {#each workspace.threads as thread, i (thread.id)}
        {#if thread.fresh}
          <FreshThread {workspace} />
        {:else}
          <ThreadColumn
            {thread}
            focused={i === app.threadIndex}
            onfocus={() => app.focusThread(i)}
          />
        {/if}
      {/each}
    </div>
  {/key}
</div>

<style>
  .viewport {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-width: 0;
  }

  .strip {
    position: absolute;
    left: 50%;
    top: 18px;
    bottom: 14px;
    display: flex;
    transition: transform var(--dur-strip) var(--ease-strip);
    will-change: transform;
  }

  :global(.strip > *) {
    width: var(--column-w);
  }
</style>
