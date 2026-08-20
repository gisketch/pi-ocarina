<!-- The editor's markdown reading view (spec: pane-reveal-and-editor).

     One node dispatch over the chat's own markdown components — Inline,
     Fence, Table, Quote, Picture — fed by the same cached parse the
     transcript uses, so a markdown file reads exactly like pi prose. Only
     the glue is local: no nav targets, no stream caret, no attachment
     cards, because a document is not a transcript. -->
<script lang="ts">
  import type { ListItem, MarkdownNode } from '$lib/thread'
  import { parseMarkdownCached } from '$lib/parse-cache'
  import Icon from '../Icon.svelte'
  import Fence from '../thread/md/Fence.svelte'
  import Inline from '../thread/md/Inline.svelte'
  import Picture from '../thread/md/Picture.svelte'
  import Quote from '../thread/md/Quote.svelte'
  import Table from '../thread/md/Table.svelte'

  const { text }: { text: string } = $props()

  const nodes = $derived(parseMarkdownCached(text))
</script>

{#snippet items(list: ListItem[])}{#each list as item, j (j)}<li
    class:task={item.done !== undefined}
    >{#if item.done !== undefined}<span class="box" class:on={item.done}
      >{#if item.done}<Icon name="check" />{/if}</span
    >{/if}<Inline parts={item.segments} />{#if item.children}{#if item.childrenOrdered}<ol
        start={item.childrenStart ?? 1}>{@render items(item.children)}</ol
      >{:else}<ul>{@render items(item.children)}</ul>{/if}{/if}</li
  >{/each}{/snippet}

{#snippet render(node: MarkdownNode)}
  {#if node.type === 'paragraph'}
    <p><Inline parts={node.segments} /></p>
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
  {:else if node.type === 'table'}
    <Table {node} />
  {:else if node.type === 'quote'}
    <Quote {node} />
  {:else if node.type === 'image'}
    <Picture src={node.src} alt={node.alt} />
  {/if}
{/snippet}

<div class="doc">
  {#each nodes as node, i (i)}
    {@render render(node)}
  {/each}
</div>

<style>
  /* The chat message body's typography, verbatim: same face, size, leading
     and heading treatment, so a rendered README and a pi answer read as one
     family. */
  .doc {
    font-family: var(--font-body);
    font-size: 12.5px;
    color: var(--fg-agent);
    line-height: 1.7;
  }

  .doc :global(p) {
    margin: 0;
  }

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
    background: rgba(255, 255, 255, 0.09);
  }
  .h span {
    flex: none;
  }
  .h3 {
    font-weight: 400;
    color: var(--fg-body);
  }
  .h3::after {
    background: rgba(255, 255, 255, 0.035);
  }
  .doc > .h:first-child {
    margin-top: 0;
  }

  .rule {
    height: 1px;
    margin: 12px 0;
    background: repeating-linear-gradient(90deg, var(--fg-ghost) 0 4px, transparent 4px 8px);
  }

  .doc :global(li.task) {
    list-style: none;
    margin-left: -30px;
  }
  .box {
    display: inline-block;
    width: 12px;
    height: 12px;
    line-height: 11px;
    text-align: center;
    margin-right: 8px;
    vertical-align: -1px;
    background: rgba(255, 255, 255, 0.09);
    color: transparent;
    font-size: 10px;
  }
  .box.on {
    color: var(--tone-1);
    background: color-mix(in srgb, var(--tone-1) 22%, transparent);
  }

  .doc :global(li > ul),
  .doc :global(li > ol) {
    margin: 4px 0 0;
  }

  .doc :global(p + p),
  .doc :global(ul),
  .doc :global(ol) {
    margin: 8px 0 0;
  }

  ul,
  ol {
    padding-left: 30px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li::marker {
    color: var(--fg-dimmest);
  }
</style>
