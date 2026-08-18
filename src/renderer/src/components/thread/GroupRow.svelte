<script lang="ts">
  import { chevron, metaSegments } from '$lib/ledger'
  import type { RowGroup } from '$lib/ledger-groups'
  import type { ToolRow } from '$lib/thread'

  /** A run of similar calls, as one row.
   *
   *  `read · 4 files · worker.ts · retry.ts · heap.ts +1 · 412L`, and the four
   *  rows themselves one expand away. Its own component because the ledger's
   *  row grammar is already a full file, and because a group is a different
   *  grammar: a count and a preview where a row has a target.
   *
   *  The members are drawn by the ledger's own snippet, passed in — a group
   *  must not grow a second way of drawing a tool row. */
  interface Props {
    group: RowGroup
    open: boolean
    ontoggle: () => void
    entry: import('svelte').Snippet<[ToolRow, boolean]>
  }

  const { group, open, ontoggle, entry }: Props = $props()

  // A live group draws open whatever the reader last chose: while a sweep is
  // running, the call in flight is the one thing they cannot be asked to
  // expand for. It collapses to its summary when the run ends.
  const shown = $derived(open || group.live)
</script>

<div class="group" class:live={group.live}>
  <span class="node" class:pulse={group.live}></span>
  <button class="row" onclick={ontoggle}>
    <!-- The bare kind, never a tense. A group is a category of call, not one
         call that happened: `edited 2 calls` claims a single edit and reads as
         a grammatical mistake beside `read 4 calls`. -->
    <span class="kind">{group.tool}</span>
    <span class="count">{group.rows.length} {group.rows.length === 1 ? 'call' : 'calls'}</span>
    <span class="preview">{group.preview}</span>
    <span class="meta">
      {#each metaSegments(group.meta) as segment, i (i)}<span class={segment.tone ?? ''}
        >{segment.text}</span
      >{/each}<span class="chev"> {chevron(shown)}</span>
    </span>
  </button>
</div>

{#if shown}
  <div class="members">
    {#each group.rows as row (row.id)}
      {@render entry(row, false)}
    {/each}
  </div>
{/if}

<style>
  .group {
    position: relative;
    contain: layout style;
  }
  /* Centred on the ledger's spine, the same way a row's node is. */
  .node {
    position: absolute;
    left: -20px;
    top: 9px;
    width: 7px;
    height: 7px;
    background: var(--fg-dimmer);
  }
  .group.live .node {
    background: var(--accent);
  }
  .node.pulse {
    animation: pulse 1.1s ease-in-out infinite;
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 6px;
    font-size: 12px;
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    font-family: var(--font-body);
    color: inherit;
    cursor: pointer;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .kind {
    font-family: var(--font-chrome);
    font-size: 10px;
    width: max(36px, var(--gutter, 4ch));
    flex: none;
    color: var(--fg-dim);
  }
  .count {
    color: var(--fg);
    flex: none;
  }
  /* Loses first when the row is narrow: the count above it already said how
     much happened, and a truncated list of names still reads. */
  .preview {
    color: var(--fg-dimmest);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .meta {
    margin-left: auto;
    font-size: 11px;
    white-space: nowrap;
    color: var(--fg-dimmest);
    flex: none;
  }
  .meta :global(.ok) {
    color: var(--ok);
  }
  .meta :global(.err) {
    color: var(--err);
  }
  .meta :global(.warn) {
    color: var(--warn);
  }
  .chev {
    color: var(--fg-dimmest);
  }

  /* Members sit under the summary the way a subagent's calls sit under it —
     one indent and a rule, so the run reads as belonging to the row above. */
  .members {
    margin: 0 0 4px 14px;
    border-left: 1px solid var(--line-soft, rgba(255, 255, 255, 0.08));
    padding-left: 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
