<script lang="ts">
  /** Markdown inside a tool body.
   *
   *  Deliberately not `Message`'s renderer. A message block is a navigation
   *  target with a block menu, a caret and leap labels attached to it; a
   *  fetched page inside a tool row is none of those things, and giving it
   *  those would put a block menu on text nobody asked to act on. Same parser,
   *  same leaf components, plainer drawing. */
  import { parseMarkdown } from '$lib/thread'
  import Fence from './Fence.svelte'
  import Inline from './Inline.svelte'
  import Picture from './Picture.svelte'
  import Quote from './Quote.svelte'
  import Table from './Table.svelte'

  const { text }: { text: string } = $props()

  const nodes = $derived(parseMarkdown(text))
</script>

<div class="prose">
  {#each nodes as node, i (i)}
    {#if node.type === 'heading'}
      <div class="head" class:big={node.level <= 2}><Inline parts={node.segments} /></div>
    {:else if node.type === 'code'}
      <Fence {node} />
    {:else if node.type === 'quote'}
      <Quote {node} />
    {:else if node.type === 'table'}
      <Table {node} />
    {:else if node.type === 'image'}
      <Picture {node} />
    {:else if node.type === 'list'}
      <ul>
        {#each node.items as item, j (j)}
          <li>
            <span class="marker">{node.ordered ? `${(node.start ?? 1) + j}.` : '·'}</span>
            <span><Inline parts={item.segments} /></span>
          </li>
          {#each item.children ?? [] as child, k (k)}
            <li class="deep">
              <span class="marker">{item.childrenOrdered ? `${(item.childrenStart ?? 1) + k}.` : '·'}</span>
              <span><Inline parts={child.segments} /></span>
            </li>
          {/each}
        {/each}
      </ul>
    {:else if node.type === 'rule'}
      <hr />
    {:else}
      <p><Inline parts={node.segments} /></p>
    {/if}
  {/each}
</div>

<style>
  .prose {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--fg-agent);
  }

  .head {
    color: var(--fg-bright);
  }
  .head.big {
    font-size: 12.5px;
  }

  p {
    margin: 0;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  li {
    display: flex;
    gap: 7px;
  }
  li.deep {
    padding-left: 14px;
  }
  .marker {
    color: var(--fg-dimmest);
    flex: none;
  }

  hr {
    border: none;
    border-top: 1px solid var(--line);
    margin: 2px 0;
    width: 100%;
  }
</style>
