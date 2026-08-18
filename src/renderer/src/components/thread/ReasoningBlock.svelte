<script lang="ts">
  /** What the model thought, drawn as the tool call it effectively is.
   *
   *  Same grammar as every other row in the transcript — icon on the spine,
   *  gutter word, target, meta — because thinking is another thing the agent
   *  did on the way to an answer, and a reader should not have to learn a
   *  second shape to skim past it.
   *
   *  No chevron: the row is the control, the way every other expandable row in
   *  this ledger is, and a second affordance saying the same thing is one more
   *  thing to look at. Collapsed shows nothing at all — a tail line under a
   *  collapsed row is the row not being collapsed.
   *
   *  Markdown-rendered but quieter: a model writes `**this**` and backticks
   *  while it thinks, and showing the asterisks is showing it raw. */
  import Icon from '../Icon.svelte'
  import Inline from './md/Inline.svelte'
  import { toolIcon } from '$lib/icons'
  import { parseInline } from '$lib/markdown-inline'
  import { reasoningOpen } from '$lib/state/reasoning.svelte'

  interface Props {
    id: string
    text: string
    streaming?: boolean
    ms?: number
    threadId?: string
  }

  const { id, text, streaming = false, ms, threadId = '' }: Props = $props()

  const open = $derived(reasoningOpen.isOpen(threadId, id))
  const took = $derived(ms === undefined || ms < 100 ? '' : `${(ms / 1000).toFixed(1)}s`)
</script>

<div class="ledger">
  <div class="entry">
    <span class="node" class:pulse={streaming}><Icon name={toolIcon('think')} /></span>
    <button class="row" onclick={() => reasoningOpen.toggle(threadId, id)}>
      <span class="kind">think</span>
      <span class="target">{streaming ? 'thinking…' : 'reasoning'}</span>
      <span class="meta">{took}</span>
    </button>

    {#if open || streaming}
      <!-- While it streams the thought is the point: hiding it behind a click
           would mean the transcript looks stalled during the one part of a
           turn that is visibly happening. -->
      <div class="body"><Inline parts={parseInline(text)} /></div>
    {/if}
  </div>
</div>

<style>
  /* The ledger's own spine, so a reasoning row lines up with the tool rows
     above and below it rather than sitting in its own margin. */
  .entry {
    position: relative;
    contain: layout style;
  }

  /* Geometry from `tokens.css`; only the colour is this row's own. */
  .node {
    color: var(--fg-dimmer);
  }
  .node.pulse {
    animation: pulse 1.1s ease-in-out infinite;
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
    cursor: pointer;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .kind {
    font-family: var(--font-chrome);
    font-size: 10px;
    width: max(36px, var(--gutter, 4ch));
    flex: none;
    color: var(--fg-dimmer);
  }
  /* A step below a tool row's target: this is the thinking, not the doing. */
  .target {
    color: var(--fg-dim);
  }
  .meta {
    margin-left: auto;
    font-size: 11px;
    white-space: nowrap;
    color: var(--fg-dimmest);
  }

  /* Straight under the row, with no rule of its own. The ledger already draws
     one spine; a second one beside the thought made the block look like a
     ledger inside a ledger. */
  .body {
    margin: 0 0 6px 6px;
    padding: 2px 0;
    font-size: 11px;
    line-height: 1.7;
    color: var(--fg-dimmest);
    white-space: pre-wrap;
  }
  /* Markdown, but quieter: bold lifts one step, never to full strength. */
  .body :global(.b) {
    color: var(--fg-dim);
  }
  .body :global(code) {
    font-size: 10.5px;
  }
</style>
