<script lang="ts">
  import { app } from '$lib/state/app.svelte'

  const { onclose }: { onclose: () => void } = $props()

  const ws = $derived(app.workspace)

  type Tone = 'path' | 'branch' | 'prompt' | 'dim' | 'warn' | 'ok'
  interface Segment {
    text: string
    tone?: Tone
  }

  // Rendered as line data rather than literal newlines: Svelte normalises
  // whitespace in templates, which collapses a `white-space: pre` block.
  const lines = $derived<Segment[][]>([
    [
      { text: `~/dev/${ws.name}`, tone: 'path' },
      { text: ' ' },
      { text: ` ${ws.branch}`, tone: 'branch' },
      { text: ' ' },
      { text: '❯', tone: 'prompt' },
      { text: ' git status -sb' },
    ],
    [
      { text: `## ${ws.branch}...origin/${ws.branch} `, tone: 'dim' },
      { text: '[ahead 1]', tone: 'warn' },
    ],
    [{ text: ' M', tone: 'warn' }, { text: ' ' }, { text: 'src/sync/worker.ts', tone: 'dim' }],
    [{ text: ' A', tone: 'ok' }, { text: ' ' }, { text: 'src/sync/retry.ts', tone: 'dim' }],
    [
      { text: `~/dev/${ws.name}`, tone: 'path' },
      { text: ' ' },
      { text: ` ${ws.branch}*`, tone: 'warn' },
      { text: ' ' },
      { text: '❯', tone: 'prompt' },
      { text: ' ' },
    ],
  ])
</script>

<div class="drawer">
  <div class="head">
    <span class="dot"></span>TERMINAL · bash — {ws.name}
    <span class="actions">
      <span class="kbd">t</span>
      <button type="button" class="close" onclick={onclose} aria-label="Close terminal">✕</button>
    </span>
  </div>

  <div class="body">
    {#each lines as segments, row (row)}
      <div class="line">{#each segments as segment, i (i)}<span class={segment.tone ?? ''}
          >{segment.text}</span
        >{/each}{#if row === lines.length - 1}<span class="caret"></span>{/if}</div>
    {/each}
  </div>
</div>

<style>
  .drawer {
    flex: none;
    margin: 0 28px 12px;
    border: 1px solid var(--line-faint);
    background: var(--bg-deep);
    animation: slideup 0.18s ease;
    max-width: var(--column-w);
    width: 100%;
    align-self: center;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }

  .dot {
    width: 6px;
    height: 6px;
    background: var(--accent);
    flex: none;
  }

  .actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--fg-dimmest);
  }
  .kbd {
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 1px 5px;
  }
  .close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    font-family: var(--font-chrome);
    font-size: 10px;
  }
  .close:hover {
    color: var(--err);
  }

  .body {
    padding: 12px 14px;
    font-family: var(--font-body);
    font-size: 11.5px;
    line-height: 1.85;
    max-height: 200px;
    overflow-y: auto;
  }

  .line {
    white-space: pre;
  }

  .path {
    color: var(--fg-dimmest);
  }
  .branch,
  .prompt {
    color: var(--accent);
  }
  .dim {
    color: var(--fg-dim);
  }
  .warn {
    color: var(--warn);
  }
  .ok {
    color: var(--ok);
  }

  .caret {
    display: inline-block;
    width: 7px;
    height: 13px;
    background: var(--accent);
    vertical-align: text-bottom;
    animation: caret 1s step-end infinite;
  }
</style>
