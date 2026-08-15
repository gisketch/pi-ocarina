<script lang="ts">
  import ToolBody from './ToolBody.svelte'
  import { chevron, initialOpenState, isExpandable, labelTone, metaSegments, metaTone, nodeTone } from '$lib/ledger'
  import type { ToolRow } from '$lib/thread'

  const { rows }: { rows: ToolRow[] } = $props()

  // Each row carries its own default expansion; user toggles layer on top so rows
  // that arrive later (streaming) still open with their intended default.
  let overrides = $state<Record<string, boolean>>({})
  const open = $derived({ ...initialOpenState(rows), ...overrides })

  function toggle(row: ToolRow): void {
    if (!isExpandable(row)) return
    overrides = { ...overrides, [row.id]: !open[row.id] }
  }
</script>

{#snippet entry(row: ToolRow, nested: boolean)}
  <div class="entry">
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
          >{/each}{#if isExpandable(row)}<span class="chev"> {chevron(open[row.id])}</span>{/if}
        </span>
      {/if}
    </svelte:element>

    {#if row.body && open[row.id]}
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

<div class="ledger">
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
    /* Rows are independent of each other, so a change in one never forces the
       rest of a long ledger to be re-laid-out. */
    contain: layout style;
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
