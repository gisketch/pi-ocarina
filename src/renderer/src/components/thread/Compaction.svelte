<script lang="ts">
  /** The compaction divider: one line while it runs, one line when it is done.
   *
   *  Never a card and never a summary. The summary pi writes is for the model
   *  — the reader's record is the conversation itself, which stays in the
   *  transcript untouched. All this line has to say is that a compaction
   *  happened and what it bought. */
  import Icon from '../Icon.svelte'
  import { elapsed } from '$lib/elapsed'
  import { formatTokens } from '$lib/usage-format'
  import { clock } from '$lib/state/clock.svelte'

  interface Props {
    running: boolean
    beforePercent?: number
    afterPercent?: number
    /** Raw tokens reclaimed, when pi reported both counts. */
    tokensSaved?: number
    /** Set when the compaction started and then did not happen. */
    skipped?: string
  }

  const { running, beforePercent, afterPercent, tokensSaved, skipped }: Props = $props()

  // When this divider appeared, which is when the compaction started: the
  // block exists from the `compaction-start` event on. Good enough for a
  // ticking duration, and honest — events carry no clock of their own.
  const startedAt = Date.now()

  // Only a running divider watches the clock; a thread of finished ones
  // holds nothing ticking.
  $effect(() => {
    if (!running) return
    return clock.watch()
  })

  const took = $derived(elapsed(clock.now - startedAt))

  /** What a finished compaction gained. Tokens when pi counted them; the
   *  context percentages otherwise, so an old recording still says something. */
  const gained = $derived(
    tokensSaved !== undefined && tokensSaved > 0
      ? `${formatTokens(tokensSaved)} saved`
      : beforePercent !== undefined && afterPercent !== undefined
        ? `ctx ${beforePercent}% → ${afterPercent}%`
        : '',
  )
</script>

<div class="line" class:running>
  <span class="rule"></span>
  {#if running}
    <span class="mark pulse"><Icon name="compact" /></span>
    <span class="label">compacting conversation · {took}</span>
  {:else if skipped}
    <span class="mark"><Icon name="compact" /></span>
    <span class="label">not compacted · {skipped}</span>
  {:else}
    <span class="mark"><Icon name="compact" /></span>
    <span class="label">compacted{gained ? ` · ${gained}` : ''}</span>
  {/if}
  <span class="rule"></span>
</div>

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-block: 4px;
    font-size: 10px;
    font-family: var(--font-chrome);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-dimmest);
  }
  .line.running {
    color: var(--fg-dim);
  }

  .rule {
    height: 1px;
    flex: 1;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.14) 0 4px,
      transparent 4px 8px
    );
  }

  .mark {
    display: inline-flex;
    flex: none;
    font-size: 11px;
  }
  /* The app's one vocabulary for "this is happening": the same breath the
     turn footer's square and a running tool row take. */
  .pulse {
    color: var(--accent);
    animation: pulse 1.1s ease-in-out infinite;
  }

  .label {
    white-space: nowrap;
  }
</style>
