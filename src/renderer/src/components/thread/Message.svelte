<script lang="ts">
  import { parseMarkdown, type InlineSegment, type ListItem, type MarkdownNode } from '$lib/thread'
  import { segmentsOf } from '$lib/markdown-segments'
  import { CLEAN, highlightLine, type LineState } from '$lib/highlight'
  import { navTarget } from '$lib/state/block-focus.svelte'

  interface Props {
    role: 'user' | 'agent'
    text: string
    streaming?: boolean
    /** The agent's name is said once per turn, above everything it did, so an
     *  agent message inside a turn that already named it stays unlabelled. */
    labelled?: boolean
    /** Present when the message is a stop for `j`. The demo catalog renders
     *  messages with no thread behind them, which have no nav model. */
    threadId?: string
    blockId?: string
    focusedNav?: string | null
    /** Whether anything in the thread is focused, which is what dims the rest. */
    dimmed?: boolean
  }

  const {
    role,
    text,
    streaming = false,
    labelled = true,
    threadId,
    blockId,
    focusedNav = null,
    dimmed = false,
  }: Props = $props()

  const nodes = $derived(parseMarkdown(text))
  const segments = $derived(segmentsOf(nodes))

  /** A message with one segment keeps the block's own id, so nothing about the
   *  common case changes. `blocks.ts` numbers them the same way. */
  const navIdOf = (at: number): string | null => {
    if (!blockId) return null
    return segments.length <= 1 ? blockId : `${blockId}#${at}`
  }

  /** The caret belongs on the last thing the agent wrote. */
  const lastSegment = $derived(segments.length - 1)

  /** Whether the caret already has a paragraph to sit on. */
  const endsInParagraph = $derived(nodes[nodes.length - 1]?.type === 'paragraph')

  /** Lines of a fenced block, each carrying the state the one above ended in.
   *
   *  Tokenised per line rather than per block: a streaming fence changes only
   *  its last line, and Svelte re-renders only the line whose tokens changed. */
  function codeLines(node: MarkdownNode & { type: 'code' }) {
    let state: LineState = CLEAN
    return node.text.split('\n').map((line) => {
      const { tokens, to } = highlightLine(line, node.lang, state)
      state = to
      return tokens
    })
  }
</script>

{#snippet inline(parts: InlineSegment[])}{#each parts as part, i (i)}{#if part.code}<code
      class:b={part.bold}>{part.text}</code
    >{:else if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}{/snippet}

{#snippet items(list: ListItem[])}{#each list as item, j (j)}<li
    >{@render inline(item.segments)}{#if item.children}{#if item.childrenOrdered}<ol
        >{@render items(item.children)}</ol
      >{:else}<ul>{@render items(item.children)}</ul>{/if}{/if}</li
  >{/each}{/snippet}

{#snippet render(node: MarkdownNode, caret: boolean)}
  {#if node.type === 'paragraph'}
    <p>{@render inline(node.segments)}{#if caret}<span class="caret"></span>{/if}</p>
  {:else if node.type === 'heading'}
    <div class="h h{node.level}"><span>{@render inline(node.segments)}</span></div>
  {:else if node.type === 'rule'}
    <div class="rule" role="separator"></div>
  {:else if node.type === 'list'}
    {#if node.ordered}
      <ol>{@render items(node.items)}</ol>
    {:else}
      <ul>{@render items(node.items)}</ul>
    {/if}
  {:else if node.type === 'code'}
    <pre class="fence"><span class="lang">{node.lang || 'text'}</span><code
        >{#each codeLines(node) as tokens, line (line)}<span class="cl"
          >{#each tokens as token, t (t)}<span class="tok-{token.kind}">{token.text}</span
            >{/each}</span
        >{/each}</code
      ></pre>
  {/if}
{/snippet}

<div class="message {role}">
  {#if labelled}
    <div class="label">{role === 'user' ? 'YOU' : '■ PI'}</div>
  {/if}

  <div class="text">
    {#each segments as segment, at (at)}
      <div
        class="seg"
        class:dim={dimmed && segments.length > 1 && focusedNav !== navIdOf(at)}
        use:navTarget={{ threadId: threadId ?? '', navId: threadId ? navIdOf(at) : null }}
      >
        {#each segment as node, i (i)}
          {@render render(node, streaming && at === lastSegment && i === segment.length - 1 && node.type === 'paragraph')}
        {/each}
      </div>
    {/each}

    {#if streaming && !endsInParagraph}
      <span class="caret"></span>
    {/if}
  </div>
</div>

<style>
  .message {
    display: flex;
    flex-direction: column;
  }
  .user {
    gap: 6px;
  }
  .agent {
    gap: 8px;
  }

  .label {
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
  .agent .label {
    color: var(--accent);
  }

  .text {
    font-family: var(--font-body);
    font-size: 12.5px;
  }
  .user .text {
    color: var(--fg-body);
    line-height: 1.65;
  }
  .agent .text {
    color: var(--fg-agent);
    line-height: 1.7;
  }

  .text :global(p) {
    margin: 0;
  }

  .seg {
    display: flex;
    flex-direction: column;
    transition: opacity 0.12s ease;
  }
  /* Muted by colour, the way every other dim in the column works — an overlay
     painted over the text cannot escape `opacity` or `filter`. */
  .seg.dim {
    --fg-bright: var(--fg-dimmer);
    --fg-body: var(--fg-dimmer);
    --fg: var(--fg-dimmer);
    --fg-agent: var(--fg-dimmer);
    --fg-dim: var(--fg-dimmer);
    --fg-dimmest: var(--fg-dimmer);
    --accent: var(--fg-dimmer);
    --tone-1: var(--fg-dimmer);
    --tone-2: var(--fg-dimmer);
    --tone-3: var(--fg-dimmer);
    color: var(--fg-dimmer);
  }
  .seg + .seg {
    margin-top: 10px;
  }

  /* A heading is bold at body size with a hairline out to the column edge.
     The size never changes: depth is weight and the weight of the rule. */
  .h {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 12px 0 2px;
    font-weight: 700;
    color: var(--fg-bright);
  }
  .h::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line-strong);
  }
  .h span {
    flex: none;
  }
  .h3 {
    font-weight: 400;
    color: var(--fg-body);
  }
  .h3::after {
    background: var(--line-faint);
  }
  .seg > .h:first-child {
    margin-top: 0;
  }

  /* The dashed rule the checkpoint separator used, which is what a thematic
     break already looked like in this column. */
  .rule {
    height: 1px;
    margin: 12px 0;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.14) 0 4px,
      transparent 4px 8px
    );
  }

  .text :global(strong) {
    font-weight: 700;
    color: var(--fg-bright);
  }
  .text :global(code.b) {
    font-weight: 700;
  }

  .text :global(li > ul),
  .text :global(li > ol) {
    margin: 4px 0 0;
  }

  .cl {
    display: block;
  }
  /* An empty line still needs a line's height, or a blank line in a fence
     collapses and the code shifts under the reader. */
  .cl:empty::before {
    content: '\200b';
  }
  .text :global(p + p),
  .text :global(ul),
  .text :global(ol),
  .fence {
    margin: 8px 0 0;
  }

  code {
    background: var(--bg-chip);
    padding: 1px 5px;
    font-size: 12px;
    color: var(--fg-body);
    font-family: var(--font-body);
  }

  ul,
  ol {
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li::marker {
    color: var(--fg-dimmest);
  }

  /* Fenced blocks keep the reference's chrome — a bordered surface with the
     language named. Syntax highlighting is deliberately deferred; the block
     must read as code before it reads as coloured code. */
  .fence {
    position: relative;
    border: 1px solid var(--line-faint);
    background: var(--bg);
    padding: 20px 12px 10px;
    overflow-x: auto;
  }
  .fence code {
    background: none;
    padding: 0;
    color: var(--fg-body);
    font-size: 11.5px;
    line-height: 1.6;
    white-space: pre;
  }
  .lang {
    position: absolute;
    top: 5px;
    left: 12px;
    font-family: var(--font-chrome);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--fg-dimmest);
  }

  .caret {
    display: inline-block;
    width: 7px;
    height: 14px;
    background: var(--accent);
    margin-left: 5px;
    vertical-align: text-bottom;
    animation: caret 1s step-end infinite;
  }
</style>
