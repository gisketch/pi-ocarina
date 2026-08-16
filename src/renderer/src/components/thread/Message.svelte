<script lang="ts">
  import { parseMarkdown, type ListItem, type MarkdownNode } from '$lib/thread'
  import BlockMenu from './BlockMenu.svelte'
  import { blockMenu } from '$lib/state/block-menu.svelte'
  import Fence from './md/Fence.svelte'
  import Inline from './md/Inline.svelte'
  import Picture from './md/Picture.svelte'
  import Quote from './md/Quote.svelte'
  import Table from './md/Table.svelte'

  import { segmentsOf } from '$lib/markdown-segments'
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

  /** Whether the menu is open on this exact segment.
   *
   *  Rendered here rather than on the message's wrapper: a long answer is
   *  taller than the screen, and a menu pinned to the top of it opens far above
   *  the block the reader is pointing at — often off-screen, which reads as
   *  the key doing nothing at all. */
  const menuOn = (at: number): boolean =>
    blockMenu.open && blockMenu.threadId === threadId && blockMenu.block?.id === navIdOf(at)

  /** Whether the caret already has a paragraph to sit on. */
  const endsInParagraph = $derived(nodes[nodes.length - 1]?.type === 'paragraph')

</script>

{#snippet items(list: ListItem[])}{#each list as item, j (j)}<li
    class:task={item.done !== undefined}
    >{#if item.done !== undefined}<span class="box" class:on={item.done}
      >{item.done ? '×' : ' '}</span
    >{/if}<Inline parts={item.segments} />{#if item.children}{#if item.childrenOrdered}<ol
        >{@render items(item.children)}</ol
      >{:else}<ul>{@render items(item.children)}</ul>{/if}{/if}</li
  >{/each}{/snippet}

{#snippet render(node: MarkdownNode, caret: boolean)}
  {#if node.type === 'paragraph'}
    <p><Inline parts={node.segments} />{#if caret}<span class="caret"></span>{/if}</p>
  {:else if node.type === 'heading'}
    <div class="h h{node.level}"><span><Inline parts={node.segments} /></span></div>
  {:else if node.type === 'rule'}
    <div class="rule" role="separator"></div>
  {:else if node.type === 'list'}
    {#if node.ordered}
      <ol start={node.start ?? 1}>{@render items(node.items)}</ol>
    {:else}
      <ul>{@render items(node.items)}</ul>
    {/if}
  {:else if node.type === 'code'}
    <Fence {node} />
  {:else}
    <!-- Kinds with markup of their own. A new one lands here as a rule in
         `markdown-block.ts`, a node type, a component, and one branch — and
         nothing outside this file has to know it exists. -->
    {#if node.type === 'table'}
      <Table {node} />
    {:else if node.type === 'quote'}
      <Quote {node} />
    {:else if node.type === 'image'}
      <Picture {node} />
    {/if}
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
        class:hosting={menuOn(at)}
        use:navTarget={{ threadId: threadId ?? '', navId: threadId ? navIdOf(at) : null }}
      >
        {#if menuOn(at)}<BlockMenu />{/if}
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
    position: relative;
    display: flex;
    flex-direction: column;
    transition: opacity 0.12s ease;
  }
  /* The block carries paint containment from the column; a menu taller than
     its segment would be sliced off without this. */
  .seg.hosting {
    content-visibility: visible;
    contain: none;
    z-index: 5;
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
    /* Through a token, so it goes quiet with everything else: both the dim and
       the leap work by re-pointing tokens, and a literal would stay lit. */
    background: repeating-linear-gradient(90deg, var(--fg-ghost) 0 4px, transparent 4px 8px);
  }

  /* Task boxes: agents write checklists constantly, and a `[x]` rendered as
     two characters of punctuation reads as noise rather than as progress. */
  .text :global(li.task) {
    list-style: none;
    margin-left: -30px;
  }
  /* Both states are the same square. Sized rather than left to its contents:
     an empty box has only a space in it, which collapses to nothing and makes
     an unticked item read as a dash. */
  .box {
    display: inline-block;
    width: 12px;
    height: 12px;
    line-height: 11px;
    text-align: center;
    margin-right: 8px;
    vertical-align: -1px;
    border: 1px solid var(--line-strong);
    color: transparent;
    font-size: 10px;
  }
  .box.on {
    color: var(--tone-1);
    border-color: var(--tone-1);
  }

  .text :global(li > ul),
  .text :global(li > ol) {
    margin: 4px 0 0;
  }

  /* An empty line still needs a line's height, or a blank line in a fence
     collapses and the code shifts under the reader. */
  .text :global(p + p),
  .text :global(ul),
  .text :global(ol),

  ul,
  ol {
    /* Wide enough for a three-digit marker. The global reset zeroes list
       padding, and a marker is drawn outside the content box — too little room
       and `10.` hangs off the left of the column and is clipped by it. */
    padding-left: 30px;
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
