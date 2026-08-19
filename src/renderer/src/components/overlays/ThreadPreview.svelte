<script lang="ts">
  import type { ThreadId } from '../../../../shared/thread-id'
  import ThreadView from '../thread/ThreadView.svelte'
  import ThreadSkeleton from '../thread/ThreadSkeleton.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { threads } from '$lib/state/threads.svelte'

  const { threadId }: { threadId: ThreadId } = $props()

  /** How much of the tail a preview shows before being asked for more. The
   *  end of a conversation identifies it better than its start, and ten
   *  blocks render in a frame where a whole transcript might not. */
  const PREVIEW_BLOCKS = 10

  // The replay runs in the background and lands in the shared thread store —
  // the same cache every column reads, so a thread previewed once is instant
  // forever, and a reply arriving for a row no longer highlighted fills the
  // cache without touching this pane (nothing here reads it any more).
  $effect(() => {
    if (catalog.source === 'live') threads.follow(threadId)
  })

  const model = $derived(threads.get(threadId))
  const loaded = $derived(threads.isLoaded(threadId))

  // Plain state, reset by the `{#key}` around this component: a new highlight
  // is a new pane, and `earlier` is not a memory worth carrying between rows.
  let earlier = $state(false)
  const blocks = $derived(model.blocks)
  const shown = $derived(earlier ? blocks : blocks.slice(-PREVIEW_BLOCKS))
  const hidden = $derived(blocks.length - shown.length)

  // Pinned to the bottom: the tail is the preview. Re-pinned as the replay
  // grows the list, and left alone once the reader asked for `earlier` —
  // they are reading upward.
  let body = $state<HTMLElement | null>(null)
  $effect(() => {
    void shown
    if (!body || earlier) return
    body.scrollTop = body.scrollHeight
  })
</script>

{#if !loaded && blocks.length === 0}
  <!-- The same skeleton a live column shows while its replay runs: the pane
       answers on the frame the highlight moved, never a spinner over the
       input's snappiness. -->
  <ThreadSkeleton />
{:else if blocks.length === 0}
  <div class="empty">an empty thread</div>
{:else}
  <!-- The real transcript renderer, so the preview is the column it promises.
       Only the tail is handed over; the rest stays in the store until the
       chip below asks for it — a render cost, never another backend trip. -->
  <div class="body" bind:this={body}>
    {#if hidden > 0}
      <button type="button" class="earlier" onclick={() => (earlier = true)}>
        earlier… {hidden} more block{hidden === 1 ? '' : 's'}
      </button>
    {/if}
    <ThreadView {threadId} blocks={shown} />
  </div>
{/if}

<style>
  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--fg-dimmest);
  }

  /* The live column's own body, minus what a preview has no use for (the
     leap's quieting, the hidden scrollbar's reasoning still applies). */
  .body {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow-y: auto;
    padding: var(--pad-column) 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-family: var(--font-body);
    font-size: 12.5px;
  }
  .body::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  /* The same virtualization, for the same reason: `earlier…` can hand this
     pane a five-thousand-block thread in one click. */
  .body > :global(*) {
    content-visibility: auto;
    contain-intrinsic-size: auto 120px;
    padding-inline: var(--pad-column);
  }
  .body > :global(*:last-child) {
    content-visibility: visible;
  }

  .earlier {
    align-self: center;
    padding: 4px 10px;
    font-size: 10.5px;
    color: var(--fg-dim);
    background: rgba(255, 255, 255, 0.05);
    cursor: pointer;
    /* Not a block: the chip stays its own width inside the padded column. */
    width: fit-content;
  }
  .earlier:hover {
    color: var(--fg-bright);
  }
</style>
