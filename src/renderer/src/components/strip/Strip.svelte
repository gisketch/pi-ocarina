<script lang="ts">
  import { threadOf } from '$lib/types'
  import ThreadColumn from './ThreadColumn.svelte'
  import Dashboard from './Dashboard.svelte'
  import LiveThread from './LiveThread.svelte'
  import TerminalColumn from './TerminalColumn.svelte'
  import { app } from '$lib/state/app.svelte'
  import { blockNav } from '$lib/state/block-nav.svelte'
  import { COLUMN_GAP, stripOffset } from '$lib/strip'

  /** The two overlays a composer's `/` commands open. They belong to the app
   *  shell, so they are handed down rather than reached for. */
  const { onmodel, oncommit }: { onmodel: () => void; oncommit: () => void } = $props()

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
        <!-- The branch below is the proof, not a formality: a column that is
             neither the placeholder nor the shell was built from a listing pi
             minted, so `threadOf` answers with an id and everything under it
             may speak to the backend. The other two branches draw columns that
             have no session to speak to. -->
        {@const live = threadOf(thread)}
        {#if thread.fresh}
          <Dashboard {workspace} columnId={thread.id} focused={i === app.threadIndex} {onmodel} {oncommit} />
        {:else if thread.terminal}
          <TerminalColumn
            workspaceId={workspace.id}
            name={workspace.name}
            focused={i === app.threadIndex}
            onfocus={() => focusColumn(i)}
          />
        {:else if live}
          <ThreadColumn
            {thread}
            focused={i === app.threadIndex}
            onfocus={() => focusColumn(i)}
            {onmodel}
            {oncommit}
          >
            <LiveThread threadId={live} />
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
    /* No gap under the columns: the composer sits against them, so a message
       is typed at the foot of the transcript it belongs to rather than across
       a band of empty chrome. */
    bottom: 0;
    display: flex;
    transition: transform var(--dur-strip) var(--ease-strip);
    will-change: transform;
  }

  :global(.strip > *) {
    width: var(--column-w);
  }
</style>
