<script lang="ts">
  import type { MarkdownNode } from '$lib/thread'

  const { node }: { node: MarkdownNode & { type: 'image' } } = $props()

  let failed = $state(false)
</script>

<!-- The seam a screenshot arrives through. An image that will not load says so
     rather than leaving a gap the reader cannot explain. -->
{#if failed}
  <div class="missing">image unavailable{node.alt ? ` — ${node.alt}` : ''}</div>
{:else}
  <img src={node.src} alt={node.alt} loading="lazy" onerror={() => (failed = true)} />
{/if}

<style>
  img {
    display: block;
    max-width: 100%;
    border: 1px solid var(--line-faint);
  }
  .missing {
    padding: 8px 10px;
    border: 1px dashed var(--line-mid);
    color: var(--fg-dimmest);
    font-size: 11.5px;
  }
</style>
