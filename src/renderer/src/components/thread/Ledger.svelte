<script lang="ts">
  import AgentRow from './AgentRow.svelte'
  import ToolLine from './ToolLine.svelte'
  import EarlierCalls from './EarlierCalls.svelte'
  import ToolBody from './ToolBody.svelte'
  import { chevron, initialOpenState, isExpandable, metaSegments, metaTone, nodeTone } from '$lib/ledger'
  import { toolIcon } from '$lib/icons'
  import BlockMenu from './BlockMenu.svelte'
  import { navTarget } from '$lib/state/block-focus.svelte'
  import { toolOpen } from '$lib/state/tool-open.svelte'
  import { blockMenu } from '$lib/state/block-menu.svelte'
  import type { ToolRow } from '$lib/thread'
  import { drawnChildren, hiddenUnder, kindsIn, pointableRows } from '$lib/ledger-rows'
  import { widestLabel } from '$lib/tool-label'
  import GroupRow from './GroupRow.svelte'
  import Icon from '../Icon.svelte'
  import { groupRows, groupShown, type RowGroup } from '$lib/ledger-groups'
  import { groupNavId } from '$lib/blocks'

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
    /** The workspace's hue, which a child agent's sigil borrows. */
    hue: number
  }

  const { rows, threadId, blockId, focusedNav, hue }: Props = $props()

  const navIdOf = (row: ToolRow): string => `${blockId}:${row.id}`

  /** Whether the menu is open on this exact row. */
  const menuOn = (navId: string): boolean =>
    blockMenu.open && blockMenu.threadId === threadId && blockMenu.block?.id === navId

  // Each row carries its own default expansion; what a person changed layers on
  // top, so rows that arrive later (streaming) still open with their intended
  // default. The overrides live outside this component because `l` on the
  // focused block opens a row too, from a keyboard layer with nothing to reach.
  const defaults = $derived(initialOpenState(rows))

  // The gutter is as wide as the widest word this ledger could ever put in it,
  // and every row shares the one number — so targets line up with each other,
  // and none of them moves when a call lands and `editing` becomes `edited`.
  // Derived from the kinds present, never measured: a rect read here would
  // force layout on rows the column is deliberately not laying out.
  const gutter = $derived(widestLabel(kindsIn(rows)))

  const stops = $derived(pointableRows(rows))
  const anyHosting = $derived(stops.some((row) => menuOn(navIdOf(row))))
  // Keyed by nav id, not by row id: a tool call id is only unique within its
  // call, which is the same reason the nav id is built from both. Two ledgers
  // holding a row with the same id must not open each other's.
  const isOpen = (row: ToolRow): boolean =>
    toolOpen.isOpen(threadId, navIdOf(row), defaults[row.id] ?? false)

  function toggle(row: ToolRow): void {
    if (!isExpandable(row)) return
    toolOpen.toggle(threadId, navIdOf(row), defaults[row.id] ?? false)
  }

  // Runs of similar calls draw as one row. A projection over the same rows —
  // ids, bodies and order are untouched, so focus, leap and the block menu all
  // still address the rows they always did.
  const items = $derived(groupRows(rows))

  // Only when the reader asked. A group that opened because `j` walked past it
  // would undo the thing it is for — a busy turn stays four lines until
  // somebody wants the forty. `l` on the group is how they ask, and while it
  // is shut its members are not stops at all (see `navBlocks`), so nothing can
  // focus a row the transcript is not drawing.
  const groupOpen = (group: RowGroup): boolean =>
    groupShown(group, (fallback) =>
      toolOpen.isOpen(threadId, groupNavId(blockId, group), fallback),
    )
</script>

{#snippet entry(row: ToolRow, nested: boolean)}
  <!-- A nested row belongs to the row that spawned it, so it does not register:
       pointing at a subagent's third read is not something the reader can ask
       for, and a hidden nav id would swallow a `j`.
       A nested *agent* row is the exception, and has to be — it is a child, it
       is always nested under its spawn call, and `l` on it is the only way into
       the peek. Without this the peek is unreachable. -->
  {@const points = !nested || row.agent !== undefined}
  <div
    class="entry"
    class:lit={points && focusedNav === navIdOf(row)}
    class:hosting={points && menuOn(navIdOf(row))}
    use:navTarget={{ threadId, navId: points ? navIdOf(row) : null }}
  >
    {#if points && menuOn(navIdOf(row))}
      <BlockMenu />
    {/if}
    <span class="node {nodeTone(row)}" class:pulse={row.status === 'running'}
      ><Icon name={toolIcon(row.kind)} /></span
    >

    <svelte:element
      this={isExpandable(row) ? 'button' : 'div'}
      class="row"
      class:clickable={isExpandable(row)}
      class:nested
      role={isExpandable(row) ? 'button' : undefined}
      onclick={() => toggle(row)}
    >
      {#if row.agent}
        <!-- A child agent is a different grammar from a tool call, not a tool
             call with extra fields, so it replaces the row rather than
             decorating it. -->
        <AgentRow agent={row.agent} {hue} rows={row.children} />
      {:else}
        <ToolLine {row} />
      {/if}
      {#if row.meta && !row.agent}
        <span class="meta {metaTone(row)}">
          {#each metaSegments(row.meta) as segment, i (i)}<span class={segment.tone ?? ''}
            >{segment.text}</span
          >{/each}{#if isExpandable(row)}<span class="chev"><Icon
              name={chevron(isOpen(row))}
            /></span>{/if}
        </span>
      {/if}
    </svelte:element>

    {#if row.body && isOpen(row)}
      <ToolBody body={row.body} />
    {/if}

    {#if row.children?.length}
      {@const hidden = hiddenUnder(row)}
      <div class="children">
        <!-- A child's own calls are capped here and complete in the peek: thirty
             indented rows bury the fan-out they belong to, and the newest are
             what a reader is looking for. A nested *agent* is never hidden — it
             is a stop `j` can land on, and the way into the peek. -->
        {#if hidden > 0}
          <EarlierCalls count={hidden} />
        {/if}
        {#each drawnChildren(row) as child (child.id)}
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
  class:hosting={anyHosting}
  style="--gutter: {gutter}ch"
>
  {#each items as item (item.kind === 'group' ? `g:${item.id}` : item.row.id)}
    {#if item.kind === 'group'}
      <GroupRow
        group={item}
        open={groupOpen(item)}
        {threadId}
        {blockId}
        {focusedNav}
        {entry}
      />
    {:else}
      {@render entry(item.row, false)}
    {/if}
  {/each}
</div>

<style>
  /* The spine is drawn inside the box rather than as a border on its edge, and
     the padding leaves room for the node dots that sit on it. Scrollback
     virtualization gives every block paint containment, which clips to the
     padding box — a dot centred on a border-left would be sliced in half. */
  /* Position, padding and the spine itself live in `tokens.css`: three
     components draw this and they must not drift. */
  .ledger {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ledger.hosting {
    content-visibility: visible;
    contain: none;
    z-index: 5;
  }
  .entry {
    position: relative;
    transition: opacity 0.12s ease;
    /* Rows are independent of each other, so a change in one never forces the
       rest of a long ledger to be re-laid-out. */
    contain: layout style;
  }
  /* The focus band lives in `tokens.css`: more than one component draws an
     entry, and the band's reach is tied to the column's padding rather than to
     anything this file owns. */
  /* A row contains its own layout and paint, which would slice the menu off at
     the row's own height. The ledger's spine is drawn by the parent, so
     dropping containment here costs the row nothing. */
  .entry.hosting {
    contain: none;
    z-index: 5;
  }

  /* Centred on the spine at 3.5px: the row starts 20px in, so -20px puts the
     dot's left edge exactly on the ledger's padding edge and nothing overflows. */
  .node.pulse {
    animation: pulse 1.1s ease-in-out infinite;
  }
  /* The tones a node wears live in `tokens.css`: they are one mapping from
     status to colour, and three components now draw a node. */

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
    margin-left: 4px;
    color: var(--fg-dimmest);
  }

  .children {
    /* `--pad-nest` is this margin, the rule below it, and the padding. */
    margin: 0 0 4px calc((var(--pad-nest) - 1px) / 2);
    position: relative;
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    padding-left: calc((var(--pad-nest) - 1px) / 2);
    display: flex;
    flex-direction: column;
  }
  /* Centred on the children's own rule the same way, and a size smaller. */
  /* A size smaller than a top-level node; where it sits is in `tokens.css`,
     with the rest of the nesting geometry. */
  .children .node {
    top: 5px;
    width: 11px;
    height: 11px;
    font-size: 10px;
  }
  .row.nested {
    padding: 3px 6px;
    font-size: 11px;
    color: var(--fg-dim);
  }
  .row.nested :global(.kind) {
    font-size: 9px;
  }
</style>
