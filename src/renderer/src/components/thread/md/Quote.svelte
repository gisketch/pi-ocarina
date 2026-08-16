<script lang="ts">
  import Inline from './Inline.svelte'
  import type { MarkdownNode } from '$lib/thread'

  const { node }: { node: MarkdownNode & { type: 'quote' } } = $props()
</script>

<blockquote><Inline parts={node.segments} /></blockquote>

<style>
  blockquote {
    margin: 0;
    padding-left: 12px;
    border-left: 2px solid var(--line-strong);
    color: var(--fg-dim);
  }
</style>
