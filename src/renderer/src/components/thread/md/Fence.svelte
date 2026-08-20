<script lang="ts">
  import { highlightBlockCached } from '$lib/highlight-cache'
  import type { MarkdownNode } from '$lib/thread'

  const { node }: { node: MarkdownNode & { type: 'code' } } = $props()

  /** Lines of the block, each carrying the state the one above ended in.
   *
   *  Through the incremental cache, and as a derived rather than a template
   *  call: a streaming fence re-tokenizes only the lines past what the cache
   *  has seen, and a re-render with the same text re-tokenizes nothing. */
  const lines = $derived(highlightBlockCached(node.text, node.lang))
</script>

<pre><span class="lang">{node.lang || 'text'}</span><code
    >{#each lines as tokens, line (line)}<span class="cl"
      >{#each tokens as token, t (t)}<span class="tok-{token.kind}">{token.text}</span
        >{/each}</span
    >{/each}</code
  ></pre>

<style>
  pre {
    margin: 8px 0 0;
    padding: 10px 12px;
    background: var(--bg-deep);
    overflow-x: auto;
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.6;
  }

  .lang {
    display: block;
    font-family: var(--font-chrome);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--fg-ghost);
    margin-bottom: 6px;
  }

  .cl {
    display: block;
  }
  /* An empty line still needs a line's height, or a blank line in a fence
     collapses and the code shifts under the reader. */
  .cl:empty::before {
    content: '\200b';
  }
</style>
