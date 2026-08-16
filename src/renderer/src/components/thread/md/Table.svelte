<script lang="ts">
  import Inline from './Inline.svelte'
  import type { MarkdownNode } from '$lib/thread'

  const { node }: { node: MarkdownNode & { type: 'table' } } = $props()
</script>

<!-- Scrolls inside itself. A wide table must never make the column scroll
     sideways: the strip already owns horizontal movement, and a table that
     fought it for the wheel would move the reader between threads. -->
<div class="wrap">
  <table>
    <thead>
      <tr>{#each node.head as cell, i (i)}<th><Inline parts={cell.segments} /></th>{/each}</tr>
    </thead>
    <tbody>
      {#each node.rows as row, r (r)}
        <tr>{#each row as cell, c (c)}<td><Inline parts={cell.segments} /></td>{/each}</tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--fg-ghost) transparent;
  }
  table {
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    font-weight: 400;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg-dimmest);
    padding: 0 18px 7px 0;
    white-space: nowrap;
    border-bottom: 1px solid var(--line-faint);
  }
  td {
    padding: 6px 18px 6px 0;
    color: var(--fg-agent);
    vertical-align: top;
  }
  /* The first column is the key in nearly every table an agent writes — a
     method, a flag, a file. It gets the accent so the eye can run down it. */
  td:first-child {
    color: var(--tone-1);
    white-space: nowrap;
  }
</style>
