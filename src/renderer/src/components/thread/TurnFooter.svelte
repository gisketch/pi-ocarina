<script lang="ts">
  /** What the turn is doing, and then what it took.
   *
   *  The one thing on screen between sending a message and pi's first token.
   *  Without it the app looks like it did not receive the message: the reader's
   *  own words are there and nothing else is, and the only sign the turn began
   *  is that their draft went away.
   *
   *  It stays after the turn ends, because then it is the record — a reader
   *  who looked away can tell four seconds from four minutes. */
  import { elapsed } from '$lib/elapsed'
  import { clock } from '$lib/state/clock.svelte'
  import type { TurnSpan } from '$lib/thread'

  const { turn }: { turn: TurnSpan } = $props()

  const running = $derived(turn.endedAt === undefined)

  // Only a running footer watches the clock, so a thread full of finished
  // turns holds nothing ticking.
  $effect(() => {
    if (!running) return
    return clock.watch()
  })

  const took = $derived(elapsed((turn.endedAt ?? clock.now) - turn.startedAt))

  const said = $derived(
    running
      ? `working for ${took}`
      : turn.outcome === 'failed'
        ? `stopped after ${took}`
        : turn.outcome === 'stopped'
          ? `interrupted after ${took}`
          : `worked for ${took}`,
  )
</script>

<div class="footer" class:running class:failed={turn.outcome === 'failed'}>
  {#if running}<span class="mark"></span>{/if}
  {said}
</div>

<style>
  .footer {
    display: flex;
    align-items: center;
    gap: 7px;
    /* `padding-block` and not the `padding` shorthand: the column pads every
       block inline, and a shorthand here set that back to zero — the footer
       sat flush against the column's edge while everything above it was
       indented. */
    padding-block: 2px 6px;
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--fg-dimmest);
  }
  .footer.running {
    color: var(--fg-dim);
  }
  .footer.failed {
    color: var(--err);
  }
  /* The transcript's own live mark: a square that breathes, the same one a
     running tool row wears. One vocabulary for "this is happening". */
  .mark {
    width: 6px;
    height: 6px;
    background: var(--accent);
    animation: pulse 1.1s ease-in-out infinite;
  }
</style>
