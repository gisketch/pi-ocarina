<script lang="ts">
  import Inline from './Inline.svelte'
  import type { MarkdownNode } from '$lib/thread'

  const { node }: { node: MarkdownNode & { type: 'quote' } } = $props()
</script>

<blockquote><Inline parts={node.segments} /></blockquote>

<style>
  /* A quote is a block of ground rather than a bar beside the words. */
  blockquote {
    margin: 0;
    padding: 4px 12px;
    background: rgba(255, 255, 255, 0.035);
    color: var(--fg-dim);
  }
</style>
