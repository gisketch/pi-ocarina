<script lang="ts">
  import { CLEAN, highlightLine, type LineState } from '$lib/highlight'
  import type { MarkdownNode } from '$lib/thread'

  const { node }: { node: MarkdownNode & { type: 'code' } } = $props()

  /** Lines of the block, each carrying the state the one above ended in.
   *
   *  Tokenised per line rather than per block: a streaming fence changes only
   *  its last line, and Svelte re-renders only the line whose tokens changed. */
  function lines() {
    let state: LineState = CLEAN
    return node.text.split('\n').map((line) => {
      const { tokens, to } = highlightLine(line, node.lang, state)
      state = to
      return tokens
    })
  }
</script>

<pre><span class="lang">{node.lang || 'text'}</span><code
    >{#each lines() as tokens, line (line)}<span class="cl"
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
