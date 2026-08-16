<script lang="ts">
  import { blockMenu } from '$lib/state/block-menu.svelte'

  const actions = $derived(blockMenu.actions)
</script>

<div class="menu">
  <div class="head">{blockMenu.block?.label}</div>

  {#each actions as action, i (action.id)}
    <button
      type="button"
      class="row"
      class:on={i === blockMenu.index}
      onclick={() => {
        blockMenu.index = i
        blockMenu.run()
      }}
    >
      <span class="name">{action.label}</span>
      {#if i === blockMenu.index}<span class="key">⏎</span>{/if}
    </button>
  {/each}

  {#if blockMenu.confirming}
    <!-- The copy is deliberate. Restoring rewinds the conversation only; pi
         does not touch the working tree, and a user who assumed otherwise
         would be expecting their edits to disappear. Say which one it is. -->
    <div class="confirm">
      <div class="warn">Restore this checkpoint?</div>
      <div class="detail">
        This rewinds the conversation to here. Your files keep every later edit — nothing on disk is
        undone.
      </div>
      <div class="again"><span class="key">⏎</span> again to restore · <span class="key">esc</span> to keep it</div>
    </div>
  {/if}
</div>

<style>
  /* Anchored to the focused block by the wrapper it is rendered into, which is
     already `position: relative`. It hangs to the right of the ring so it never
     covers the text the reader is deciding about. */
  .menu {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 4;
    min-width: 190px;
    background: var(--bg-raise);
    border: 1px solid var(--line-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
  }

  .head {
    padding: 6px 10px;
    border-bottom: 1px solid var(--line-faint);
    font-family: var(--font-chrome);
    font-size: 9.5px;
    color: var(--fg-dimmest);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-chrome);
    font-size: 10.5px;
    color: var(--fg-dim);
  }
  .row.on {
    background: var(--bg-hover);
    color: var(--accent);
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .key {
    margin-left: auto;
    color: var(--fg-dimmest);
  }

  .confirm {
    border-top: 1px solid rgba(233, 196, 106, 0.28);
    background: var(--warn-soft);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    max-width: 260px;
  }
  .warn {
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--warn);
  }
  .detail {
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.55;
    color: var(--fg-agent);
  }
  .again {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    color: var(--fg-dimmest);
  }
  .again .key {
    margin-left: 0;
    color: var(--fg-dim);
  }
</style>
