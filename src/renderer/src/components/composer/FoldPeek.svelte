<script lang="ts">
  /** What a folded paste actually contains, shown above the composer.
   *
   *  A textarea cannot hold a clickable chip, but it always knows where the
   *  caret is — so putting the caret inside the token is how a reader asks
   *  what is in it. That works from the keyboard and from a click, without the
   *  mirror needing to receive pointer events it would then steal from the
   *  field. */
  import type { Fold } from '$lib/paste'

  const { fold }: { fold: Fold } = $props()

  /** Enough to recognise what was pasted, not enough to become the view. */
  const LINES = 12

  const lines = $derived(fold.text.split('\n'))
  const shown = $derived(lines.slice(0, LINES).join('\n'))
  const hidden = $derived(Math.max(0, lines.length - LINES))
</script>

<div class="peek">
  <div class="head">
    {fold.token.replace(/^\[|\]$/g, '')}
    <span class="hint">⌘z to unfold · ⌫ to drop</span>
  </div>
  <pre>{shown}</pre>
  {#if hidden > 0}
    <div class="more">{hidden} more {hidden === 1 ? 'line' : 'lines'}</div>
  {/if}
</div>

<style>
  .peek {
    max-width: var(--column-w);
    margin: 0 auto 6px;
    background: var(--bg-raise-3);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px 10px;
    background: var(--bg-header);
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
  .hint {
    margin-left: auto;
    color: var(--fg-dimmest);
  }

  pre {
    margin: 0;
    padding: 8px 10px;
    max-height: 150px;
    overflow: auto;
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.5;
    color: var(--fg-dim);
    white-space: pre;
  }

  .more {
    padding: 5px 10px;
    background: var(--bg-header);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
</style>
