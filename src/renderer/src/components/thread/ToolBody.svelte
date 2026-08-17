<script lang="ts">
  import { DRAWN_DIFF_LINES } from '$lib/ledger'
  import type { ToolBody } from '$lib/thread'
  import Prose from './md/Prose.svelte'
  import Picture from './md/Picture.svelte'

  const { body }: { body: ToolBody } = $props()

  // A diff is the one body that can be arbitrarily long, because it is the one
  // a person asked the agent to make. The rest are pi's output and are already
  // capped before they cross.
  const drawn = $derived(body.type === 'diff' ? body.lines.slice(0, DRAWN_DIFF_LINES) : [])
  const hidden = $derived(body.type === 'diff' ? body.lines.length - drawn.length : 0)
</script>

{#if body.type === 'code'}
  <div class="panel code">{#each body.lines as line, i (i)}<div class="line">{line.text}{#if line.comment}<span class="comment">{line.comment}</span>{/if}</div>{/each}</div>
{:else if body.type === 'matches'}
  <div class="panel matches">
    {#each body.lines as line, i (i)}
      <div>
        <span class="location">{line.location}</span>
        <span class="text">{line.before}<span class="hit">{line.match}</span>{line.after}</span>
      </div>
    {/each}
  </div>
{:else if body.type === 'diff'}
  <div class="panel diff">
    {#each drawn as line, i (i)}
      {#if line.sign === '@'}
        <div class="dline skip">{line.text}</div>
      {:else}
        <div
          class="dline"
          class:add={line.sign === '+'}
          class:del={line.sign === '-'}
          class:ctx={line.sign === ' '}
        ><span class="num">{line.line ?? ''}</span>{line.sign} {line.text}</div>
      {/if}
    {/each}
    {#if hidden > 0}
      <div class="dline more">{hidden} more {hidden === 1 ? 'line' : 'lines'} · a to open the viewer</div>
    {/if}
  </div>
{:else if body.type === 'terminal'}
  <div class="panel terminal" class:error={body.tone === 'error'}>{#each body.lines as line, i (i)}<div class={line.tone ?? ''}>{line.text}</div>{/each}</div>
{:else if body.type === 'image'}
  <div class="panel picture"><Picture src={body.src} alt={body.alt} /></div>
{:else if body.type === 'markdown'}
  <div class="panel prose"><Prose text={body.text} /></div>
{:else if body.type === 'todo'}
  <div class="panel todo">
    {#each body.items as item, i (i)}
      <div class:done={item.done}>
        <span class="box">{item.done ? '▣' : '□'}</span>
        <span class="label">{item.text}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .panel.picture {
    padding: 8px;
    /* Bounded here rather than in the component: a picture in a virtualized
       column must not be able to change the row's height by megabytes. */
    max-height: 320px;
    overflow: hidden;
  }

  .panel.prose {
    padding: 9px 12px;
    /* A fetched page is the one body that can be long prose rather than
       lines, so it scrolls inside itself instead of stretching the row. */
    max-height: 340px;
    overflow-y: auto;
  }

  .panel {
    margin: 2px 6px 6px;
    font-size: 11.5px;
    background: var(--bg-deep);
    border: 1px solid var(--bg-hover);
  }

  .code {
    padding: 9px 12px;
    line-height: 1.7;
    color: var(--fg-dim);
    white-space: pre;
    font-family: var(--font-body);
  }
  .comment {
    color: var(--fg-dimmest);
  }

  .matches {
    padding: 8px 12px;
    line-height: 1.8;
    font-family: var(--font-body);
  }
  .location {
    color: var(--fg-dimmest);
  }
  .text {
    color: var(--fg-dim);
  }
  .hit {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .diff {
    line-height: 1.75;
    font-family: var(--font-body);
  }
  .dline {
    padding: 2px 12px;
    white-space: pre;
  }
  .dline.add {
    color: var(--ok-text);
    background: var(--ok-soft);
  }
  .dline.del {
    color: var(--err-text);
    background: var(--err-soft);
  }
  .dline.ctx {
    color: var(--fg-dimmer);
  }
  /* Fixed width, right-aligned: the signs line up under each other, which is
     what lets a reader scan the left edge for what changed rather than reading
     every line. Four digits covers the files anyone reviews by eye. */
  .num {
    display: inline-block;
    width: 34px;
    margin-right: 10px;
    text-align: right;
    color: var(--fg-ghost);
    user-select: none;
  }
  /* What the row is not drawing. Stated rather than truncated in silence: a
     diff that stops without saying so reads as the whole change. */
  .more {
    color: var(--fg-dimmer);
    font-size: 10.5px;
    padding: 6px 12px;
    font-family: var(--font-chrome);
    border-top: 1px solid var(--bg-hover);
  }
  /* Not a line of the file. It says the file continues, so it is drawn as an
     aside rather than as content. */
  .skip {
    color: var(--fg-ghost);
    font-size: 10.5px;
    padding: 4px 12px;
    font-family: var(--font-chrome);
  }

  .terminal {
    padding: 9px 12px;
    line-height: 1.7;
    white-space: pre;
    font-family: var(--font-body);
    border-color: var(--line);
    color: var(--fg-dim);
  }
  .terminal.error {
    background: rgba(224, 122, 107, 0.06);
    border-color: rgba(224, 122, 107, 0.25);
  }
  .terminal :global(.prompt) {
    color: var(--fg-dimmest);
  }
  .terminal :global(.ok) {
    color: var(--ok);
  }
  .terminal :global(.err) {
    color: var(--err-text);
  }
  .terminal :global(.dim) {
    color: var(--fg-dim);
  }

  .todo {
    padding: 8px 12px;
    line-height: 1.9;
    font-family: var(--font-body);
    color: var(--fg-agent);
  }
  .todo .done {
    color: var(--fg-dimmest);
  }
  .todo .box {
    color: var(--fg-dim);
  }
  .todo .done .box {
    color: var(--ok);
  }
  .todo .done .label {
    text-decoration: line-through;
  }
</style>
