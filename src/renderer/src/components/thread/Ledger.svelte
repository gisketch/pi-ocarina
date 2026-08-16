<script lang="ts">
  import ToolBody from './ToolBody.svelte'
  import { chevron, initialOpenState, isExpandable, labelTone, metaSegments, metaTone, nodeTone } from '$lib/ledger'
  import BlockMenu from './BlockMenu.svelte'
  import { navTarget } from '$lib/state/block-focus.svelte'
  import { toolOpen } from '$lib/state/tool-open.svelte'
  import { blockMenu } from '$lib/state/block-menu.svelte'
  import type { ToolRow } from '$lib/thread'

  interface Props {
    rows: ToolRow[]
    /** Which thread this ledger belongs to, for the focus registry. */
    threadId: string
    /** The ledger block's own id. A row's nav id is built from both, because a
     *  tool call id is only unique within the call, not within the thread. */
    blockId: string
    /** The focused nav id anywhere in this thread, or null when the reader has
     *  not started navigating. */
    focusedNav: string | null
    /** Whether anything in the thread is focused — which is what turns the
     *  dim on for every row that is not it. */
    dimmed: boolean
  }

  const { rows, threadId, blockId, focusedNav, dimmed }: Props = $props()

  const navIdOf = (row: ToolRow): string => `${blockId}:${row.id}`

  /** Whether the menu is open on this exact row. */
  const menuOn = (navId: string): boolean =>
    blockMenu.open && blockMenu.threadId === threadId && blockMenu.block?.id === navId

  // Each row carries its own default expansion; what a person changed layers on
  // top, so rows that arrive later (streaming) still open with their intended
  // default. The overrides live outside this component because `l` on the
  // focused block opens a row too, from a keyboard layer with nothing to reach.
  const defaults = $derived(initialOpenState(rows))
  // Keyed by nav id, not by row id: a tool call id is only unique within its
  // call, which is the same reason the nav id is built from both. Two ledgers
  // holding a row with the same id must not open each other's.
  const isOpen = (row: ToolRow): boolean =>
    toolOpen.isOpen(threadId, navIdOf(row), defaults[row.id] ?? false)

  function toggle(row: ToolRow): void {
    if (!isExpandable(row)) return
    toolOpen.toggle(threadId, navIdOf(row), defaults[row.id] ?? false)
  }
</script>

{#snippet entry(row: ToolRow, nested: boolean)}
  <!-- Nested rows belong to the row that spawned them, so only a top-level row
       registers: pointing at a subagent's third read is not something the
       reader can ask for, and a hidden nav id would swallow a `j`. -->
  <div
    class="entry"
    class:dim={!nested && dimmed && focusedNav !== navIdOf(row)}
    class:hosting={!nested && menuOn(navIdOf(row))}
    use:navTarget={{ threadId, navId: nested ? null : navIdOf(row) }}
  >
    {#if !nested && menuOn(navIdOf(row))}
      <BlockMenu />
    {/if}
    <span class="node {nodeTone(row)}" class:pulse={row.status === 'running'}></span>

    <svelte:element
      this={isExpandable(row) ? 'button' : 'div'}
      class="row"
      class:clickable={isExpandable(row)}
      class:nested
      role={isExpandable(row) ? 'button' : undefined}
      onclick={() => toggle(row)}
    >
      <span class="kind {labelTone(row)}" class:wide={row.kind === 'agent'}>{row.kind}</span>
      <span class="target" class:struck={row.status === 'cancelled'}>{row.target}</span>
      {#if row.meta}
        <span class="meta {metaTone(row)}">
          {#each metaSegments(row.meta) as segment, i (i)}<span class={segment.tone ?? ''}
            >{segment.text}</span
          >{/each}{#if isExpandable(row)}<span class="chev"> {chevron(isOpen(row))}</span>{/if}
        </span>
      {/if}
    </svelte:element>

    {#if row.body && isOpen(row)}
      <ToolBody body={row.body} />
    {/if}

    {#if row.children?.length}
      <div class="children">
        {#each row.children as child (child.id)}
          {@render entry(child, true)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<!-- The ledger's own box is a direct child of the column, so it carries
     `content-visibility: auto` and with it paint containment — which clips a
     menu hanging off its last row just as surely as the row's own containment
     did. Lifting it on the row alone was half a fix. -->
<div
  class="ledger"
  class:dim={dimmed && !rows.some((row) => focusedNav === navIdOf(row))}
  class:hosting={rows.some((row) => menuOn(navIdOf(row)))}
>
  {#each rows as row (row.id)}
    {@render entry(row, false)}
  {/each}
</div>

<style>
  /* The spine is drawn inside the box rather than as a border on its edge, and
     the padding leaves room for the node dots that sit on it. Scrollback
     virtualization gives every block paint containment, which clips to the
     padding box — a dot centred on a border-left would be sliced in half. */
  .ledger {
    position: relative;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* The spine belongs to the group, not to any one row, so it fades with the
     rows rather than staying lit above them. */
  .ledger.dim::before {
    background: var(--fg-ghost);
  }
  .ledger.hosting {
    content-visibility: visible;
    contain: none;
    z-index: 5;
  }
  .ledger::before {
    content: '';
    position: absolute;
    left: 3px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--line-mid);
  }

  .entry {
    position: relative;
    transition: opacity 0.12s ease;
    /* Rows are independent of each other, so a change in one never forces the
       rest of a long ledger to be re-laid-out. */
    contain: layout style;
  }
  /* Muted by colour, not by `opacity` and `filter` — see ThreadView. */
  .entry.dim {
    --tone-1: var(--fg-dimmer);
    --tone-2: var(--fg-dimmer);
    --tone-3: var(--fg-dimmer);
    --fg-bright: var(--fg-dimmer);
    --fg-body: var(--fg-dimmer);
    --fg: var(--fg-dimmer);
    --fg-agent: var(--fg-dimmer);
    --fg-muted: var(--fg-dimmer);
    --fg-dim: var(--fg-dimmer);
    --fg-dimmest: var(--fg-dimmer);
    --accent: var(--fg-dimmer);
    --ok: var(--fg-dimmer);
    --ok-text: var(--fg-dimmer);
    --err: var(--fg-dimmer);
    --err-text: var(--fg-dimmer);
    --warn: var(--fg-dimmer);
  }
  /* A row contains its own layout and paint, which would slice the menu off at
     the row's own height. The ledger's spine is drawn by the parent, so
     dropping containment here costs the row nothing. */
  .entry.hosting {
    contain: none;
    z-index: 5;
  }

  /* Centred on the spine at 3.5px: the row starts 20px in, so -20px puts the
     dot's left edge exactly on the ledger's padding edge and nothing overflows. */
  .node {
    position: absolute;
    left: -20px;
    top: 9px;
    width: 7px;
    height: 7px;
  }
  .node.pulse {
    animation: pulse 1.1s ease-in-out infinite;
  }
  .node.accent {
    background: var(--accent);
  }
  .node.ok {
    background: var(--ok);
  }
  .node.err {
    background: var(--err);
  }
  .node.warn {
    background: var(--warn);
  }
  .node.muted {
    background: var(--fg-dimmer);
  }
  .node.dim {
    background: var(--fg-dimmest);
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
  }
  .row.clickable {
    cursor: pointer;
  }
  .row.clickable:hover {
    background: var(--bg-hover);
  }

  .kind {
    font-family: var(--font-chrome);
    font-size: 10px;
    width: 36px;
    flex: none;
  }
  .kind.wide {
    width: 42px;
  }
  .kind.accent {
    color: var(--accent);
  }
  .kind.err {
    color: var(--err);
  }
  .kind.warn {
    color: var(--warn);
  }
  .kind.muted {
    color: var(--fg-dim);
  }

  .target {
    color: var(--fg);
  }
  .target.struck {
    color: var(--fg-dim);
    text-decoration: line-through;
  }

  .meta {
    margin-left: auto;
    font-size: 11px;
    white-space: nowrap;
  }
  .meta.dim {
    color: var(--fg-dimmest);
  }
  .meta.muted {
    color: var(--fg-dim);
  }
  .meta.ok {
    color: var(--ok);
  }
  .meta.err {
    color: var(--err);
  }
  .meta.warn {
    color: var(--warn);
  }
  .meta :global(.ok) {
    color: var(--ok);
  }
  .meta :global(.err) {
    color: var(--err);
  }
  .chev {
    color: var(--fg-dimmest);
  }

  .children {
    margin: 0 0 4px 14px;
    position: relative;
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    padding-left: 14px;
    display: flex;
    flex-direction: column;
  }
  .children .node {
    left: -17px;
    top: 8px;
    width: 5px;
    height: 5px;
  }
  .row.nested {
    padding: 3px 6px;
    font-size: 11px;
    color: var(--fg-dim);
  }
  .row.nested .kind {
    font-size: 9px;
  }
</style>
