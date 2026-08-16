<script lang="ts">
  import ThreadColumn from './ThreadColumn.svelte'
  import FreshThread from './FreshThread.svelte'
  import LiveThread from './LiveThread.svelte'
  import TerminalColumn from './TerminalColumn.svelte'
  import { app } from '$lib/state/app.svelte'
  import { blockNav } from '$lib/state/block-nav.svelte'
  import { COLUMN_GAP, stripOffset } from '$lib/strip'

  const workspace = $derived(app.workspace)
  // The strip is pinned at left:50% and slid so the focused column sits centred;
  // one composited transform moves the whole rail of columns.
  const offset = $derived(stripOffset(app.threadIndex))

  /** A click changes the focused column without a keystroke, and READ belongs
   *  to one column's transcript. Reconciling here keeps the mode chip honest
   *  about what the keys will do. */
  function focusColumn(index: number): void {
    app.focusThread(index)
    blockNav.reconcileMode()
  }
</script>

<div class="viewport">
  {#key workspace.id}
    <div class="strip" style:transform="translateX({offset}px)" style:gap="{COLUMN_GAP}px">
      {#each workspace.threads as thread, i (thread.id)}
        {#if thread.fresh}
          <FreshThread {workspace} />
        {:else if thread.terminal}
          <TerminalColumn
            workspaceId={workspace.id}
            name={workspace.name}
            focused={i === app.threadIndex}
            onfocus={() => focusColumn(i)}
          />
        {:else}
          <ThreadColumn {thread} focused={i === app.threadIndex} onfocus={() => focusColumn(i)}>
            <LiveThread threadId={thread.id} />
          </ThreadColumn>
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
