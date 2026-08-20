<script lang="ts">
  /** What the model thought, under the row that says it thought it.
   *
   *  Markdown, because a model writes `**this**` and backticks while it thinks
   *  and showing the asterisks is showing it raw — but quieter and smaller
   *  than an answer. A thought styled like an answer competes with the answer,
   *  and the answer is what the reader came for. */
  import Inline from './Inline.svelte'
  import { parseInlineCached } from '$lib/parse-cache'

  const { text }: { text: string } = $props()

  /** Paragraphs, not blocks: a thought is prose, and running it through the
   *  full markdown parser would let it grow headings and tables inside a tool
   *  body. Blank lines are the only structure it keeps.
   *
   *  Parsed through the cache: a streaming thought grows at its tail, and its
   *  settled paragraphs used to re-parse on every arriving delta. */
  const paragraphs = $derived(text.split(/\n{2,}/).filter((one) => one.trim() !== ''))
  const parsed = $derived(paragraphs.map((paragraph) => parseInlineCached(paragraph)))
</script>

<div class="thought">
  {#each parsed as parts, i (i)}
    <p><Inline {parts} /></p>
  {/each}
</div>

<style>
  .thought {
    font-size: 11px;
    line-height: 1.7;
    color: var(--fg-dimmest);
  }
  p {
    margin: 0;
    white-space: pre-wrap;
  }
  p + p {
    margin-top: 6px;
  }
  /* Bold lifts one step, never to full strength. */
  .thought :global(.b) {
    color: var(--fg-dim);
    font-weight: 500;
  }
  .thought :global(code) {
    font-size: 10.5px;
  }
</style>
