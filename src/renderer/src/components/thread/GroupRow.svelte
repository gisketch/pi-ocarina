<script lang="ts">
  import { chevron, metaSegments } from '$lib/ledger'
  import { groupNavId } from '$lib/blocks'
  import { toolIcon } from '$lib/icons'
  import { navTarget } from '$lib/state/block-focus.svelte'
  import { blockMenu } from '$lib/state/block-menu.svelte'
  import BlockMenu from './BlockMenu.svelte'
  import { toolOpen } from '$lib/state/tool-open.svelte'
  import Icon from '../Icon.svelte'
  import { countedAs, type RowGroup } from '$lib/ledger-groups'
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
    threadId: string
    blockId: string
    focusedNav: string | null
    entry: import('svelte').Snippet<[ToolRow, boolean]>
  }

  const { group, open, threadId, blockId, focusedNav, entry }: Props = $props()

  // The group registers as its own stop, so `j` lands on it and `l` opens it.
  // Its own component rather than the ledger's, because the wrapper and what
  // goes in it are one thing.
  const navId = $derived(groupNavId(blockId, group))

  const menuOn = $derived(
    blockMenu.open && blockMenu.threadId === threadId && blockMenu.block?.id === navId,
  )

  // `open` already carries the rule — `live` is its fallback, so a running
  // sweep draws itself and a reader who shuts one is obeyed. Computing it here
  // as well is how the stop list and the render came to disagree.
  const shown = $derived(open)
</script>

<div
  class="entry group"
  class:live={group.live}
  class:lit={focusedNav === navId}
  class:hosting={menuOn}
  use:navTarget={{ threadId, navId }}
>
  {#if menuOn}
    <!-- A group is a stop, so `a` opens the menu on it — and without this the
         menu was open with nothing on screen to show for it. -->
    <BlockMenu />
  {/if}
  <span class="node" class:pulse={group.live}><Icon name={toolIcon(group.tool)} /></span>
  <button class="row" onclick={() => toolOpen.toggle(threadId, navId, group.live)}>
    <!-- The bare kind, never a tense. A group is a category of call, not one
         call that happened: `edited 2 calls` claims a single edit and reads as
         a grammatical mistake beside `read 4 calls`. -->
    <span class="kind">{group.tool}</span>
    <span class="count">{countedAs(group.tool, group.rows.length)}</span>
    <span class="preview">{group.preview}</span>
    <span class="meta">
      {#each metaSegments(group.meta) as segment, i (i)}<span class={segment.tone ?? ''}
        >{segment.text}</span
      >{/each}<span class="chev"><Icon name={chevron(shown)} /></span>
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
  /* Containment would slice the menu off at the row's own height. */
  .group.hosting {
    contain: none;
    z-index: 5;
  }
  /* Centred on the ledger's spine, the same way a row's node is. */
  /* Geometry from `tokens.css`; only the colour is this row's own. */
  .node {
    color: var(--fg-dimmer);
  }
  .group.live .node {
    color: var(--accent);
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
    margin-left: 4px;
    color: var(--fg-dimmest);
  }

  /* Members sit under the summary the way a subagent's calls sit under it —
     one indent and a rule, so the run reads as belonging to the row above. */
  .members {
    /* One indent, no rule. The ledger already draws a spine; a second line
       beside a nested run reads as a ledger inside a ledger, and the row's own
       icon is what says where it belongs. */
    margin: 0 0 4px 0;
    padding-left: var(--pad-nest);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
