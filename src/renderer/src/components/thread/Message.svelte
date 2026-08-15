<script lang="ts">
  import { parseMarkdown, type InlineSegment } from '$lib/thread'

  interface Props {
    role: 'user' | 'agent'
    text: string
    streaming?: boolean
  }

  const { role, text, streaming = false }: Props = $props()
  const nodes = $derived(parseMarkdown(text))

  // The caret belongs on the last thing the agent wrote, wherever that is.
  const last = $derived(nodes.length - 1)
</script>

{#snippet inline(segments: InlineSegment[])}{#each segments as segment, i (i)}{#if segment.code}<code
      >{segment.text}</code
    >{:else}{segment.text}{/if}{/each}{/snippet}

<div class="message {role}">
  <div class="label">{role === 'user' ? 'YOU' : '■ PI'}</div>

  <div class="text">
    {#each nodes as node, i (i)}
      {#if node.type === 'paragraph'}
        <p>{@render inline(node.segments)}{#if streaming && i === last}<span class="caret"
            ></span>{/if}</p>
      {:else if node.type === 'list'}
        {#if node.ordered}
          <ol>
            {#each node.items as item, j (j)}<li>{@render inline(item)}</li>{/each}
          </ol>
        {:else}
          <ul>
            {#each node.items as item, j (j)}<li>{@render inline(item)}</li>{/each}
          </ul>
        {/if}
      {:else if node.type === 'code'}
        <pre class="fence"><span class="lang">{node.lang || 'text'}</span><code>{node.text}</code
          ></pre>
      {/if}
    {/each}

    {#if streaming && (last < 0 || nodes[last]?.type !== 'paragraph')}
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
