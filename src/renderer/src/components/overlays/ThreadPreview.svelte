<script lang="ts">
  import type { ThreadId } from '../../../../shared/thread-id'
  import Message from '../thread/Message.svelte'
  import Ledger from '../thread/Ledger.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { threads } from '$lib/state/threads.svelte'

  const { threadId, hue }: { threadId: ThreadId; hue: number } = $props()

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
  <!-- The skeleton answers on the same frame the highlight moved; the replay
       is somewhere behind it. Never a spinner over the input's snappiness. -->
  <div class="skeleton" aria-label="loading preview">
    {#each Array.from({ length: 5 }, (_, i) => i) as line (line)}
      <div class="bone" style:width="{88 - line * 9}%"></div>
    {/each}
  </div>
{:else if blocks.length === 0}
  <div class="empty">an empty thread</div>
{:else}
  <div class="body" bind:this={body}>
    {#if hidden > 0}
      <button type="button" class="earlier" onclick={() => (earlier = true)}>
        earlier… {hidden} more block{hidden === 1 ? '' : 's'}
      </button>
    {/if}
    {#each shown as block (block.id)}
      {#if block.kind === 'user' || block.kind === 'agent'}
        <Message role={block.kind} text={block.text} labelled={block.kind === 'agent'} />
      {:else if block.kind === 'ledger'}
        <Ledger rows={block.rows} {threadId} blockId={block.id} focusedNav={null} {hue} />
      {:else}
        <!-- Asks, approvals, compactions, raw events: a preview identifies a
             thread, it does not relive one. One quiet line each. -->
        <div class="other">· {block.kind}</div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .skeleton {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 26px 22px;
  }
  .bone {
    height: 11px;
    background: rgba(255, 255, 255, 0.05);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--fg-dimmest);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .earlier {
    align-self: center;
    padding: 4px 10px;
    font-size: 10.5px;
    color: var(--fg-dim);
    background: rgba(255, 255, 255, 0.05);
    cursor: pointer;
  }
  .earlier:hover {
    color: var(--fg-bright);
  }
  .other {
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
</style>
