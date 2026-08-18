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
  }
  table {
    /* One grid rather than a set of boxes. Without this the cells sit two
       pixels apart, which broke the head into one chip per column and cut a
       stripe at every column edge. */
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
  }
  /* Padding on every side, including the first cell's left. A row is a band
     now, and text sitting on the edge of a band reads as clipped — the indent
     against the prose above is what says this is a table. */
  th,
  td {
    text-align: left;
    padding: 7px 16px;
  }
  th {
    font-weight: 400;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg-dimmest);
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.05);
  }
  td {
    color: var(--fg-agent);
    vertical-align: top;
  }
  /* Every other row carries a step of ground. It is what tells one row from
     the next now that no rule is drawn between them, and it reads across the
     whole width rather than per cell. */
  tbody tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.022);
  }
  /* The first column is the key in nearly every table an agent writes — a
     method, a flag, a file. It gets the accent so the eye can run down it. */
  td:first-child {
    color: var(--tone-1);
    white-space: nowrap;
  }
</style>
