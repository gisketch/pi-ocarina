<script lang="ts">
  /** What the model thought, drawn as the tool call it effectively is.
   *
   *  Same grammar as every other row in the transcript — node, gutter word,
   *  target, meta, chevron — because thinking is another thing the agent did
   *  on the way to an answer, and a reader should not have to learn a second
   *  shape to skim past it. Collapsed it shows the latest line; expanded it
   *  shows the whole thought.
   *
   *  Muted a step below a tool row, and markdown-rendered but smaller: a model
   *  writes `**this**` and backticks in its reasoning, and showing the
   *  asterisks is showing it raw. */
  import Icon from '../Icon.svelte'
  import Inline from './md/Inline.svelte'
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

  /** The tail, not the head. What the model is thinking now is the part worth
   *  a line; what it thought first is one expand away. */
  const tail = $derived(text.trim().split('\n').filter(Boolean).at(-1) ?? '')

  const took = $derived(ms === undefined || ms < 100 ? '' : `${(ms / 1000).toFixed(1)}s`)
</script>

<div class="ledger">
  <div class="entry">
    <span class="node" class:pulse={streaming}></span>
    <button class="row" onclick={() => reasoningOpen.toggle(threadId, id)}>
      <span class="kind">think</span>
      <span class="target">{streaming ? 'thinking…' : 'reasoning'}</span>
      <span class="meta">
        {took}<span class="chev"
          ><Icon name={open ? 'chevron-down' : 'chevron-right'} /></span
        >
      </span>
    </button>

    {#if open}
      <div class="body"><Inline parts={parseInline(text)} /></div>
    {:else if tail}
      <div class="body one"><Inline parts={parseInline(tail)} /></div>
    {/if}
  </div>
</div>

<style>
  /* The ledger's own spine, so a reasoning row lines up with the tool rows
     above and below it rather than sitting in its own margin. */
  .ledger {
    position: relative;
    padding-left: 20px;
  }
  .ledger::before {
    content: '';
    position: absolute;
    left: 3px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--line-mid);
  }
  .entry {
    position: relative;
    contain: layout style;
  }

  .node {
    position: absolute;
    left: -20px;
    top: 9px;
    width: 7px;
    height: 7px;
    background: var(--fg-dimmer);
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
  .chev {
    margin-left: 4px;
  }

  /* Indented under the row the way a tool body is, and smaller — the answer
     stays the loudest thing on the screen. */
  .body {
    margin: 0 0 4px 14px;
    border-left: 1px solid var(--line-soft, rgb(255 255 255 / 0.06));
    padding: 2px 0 2px 14px;
    font-size: 11px;
    line-height: 1.7;
    color: var(--fg-dimmest);
    white-space: pre-wrap;
  }
  .body.one {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Markdown, but quieter: a model writes `**this**` in its reasoning and the
     asterisks are not what it meant. Bold lifts one step, never to full
     strength. */
  .body :global(.b) {
    color: var(--fg-dim);
  }
  .body :global(code) {
    font-size: 10.5px;
  }
</style>
