<script lang="ts">
  import { connectivity } from '$lib/state/connectivity.svelte'

  // Counted down here rather than in the store: the number is a thing on
  // screen, and a store that ticked would wake every reader once a second
  // whether or not the banner was up.
  let remaining = $state<number | null>(null)

  $effect(() => {
    // Read so a fresh retry restarts the count even when it reports the same
    // wait as the one before it.
    connectivity.cycle
    const start = connectivity.degraded ? connectivity.retryInSeconds : undefined
    if (start === undefined) {
      remaining = null
      return
    }

    // The count lives here, not in `remaining`. Reading the state the effect
    // also writes would make every tick re-run the effect, which would reset
    // the number to where it started — a countdown frozen on its first value.
    let left = start
    remaining = left
    const timer = setInterval(() => {
      // Stops at zero rather than going negative: pi retries when it retries,
      // and a counter running past its own deadline reads as a stuck app.
      left = Math.max(0, left - 1)
      remaining = left
    }, 1000)
    return () => clearInterval(timer)
  })
</script>

{#if connectivity.degraded}
  <div class="banner" role="status">
    <span class="pip"></span>
    <span>RECONNECTING TO THE PROVIDER{remaining === null ? '' : ` · retry in ${remaining}s`}</span>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 8px 14px;
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--warn);
    border-bottom: 1px solid rgba(233, 196, 106, 0.28);
    background: rgba(233, 196, 106, 0.05);
  }

  .pip {
    width: 6px;
    height: 6px;
    flex: none;
    background: var(--warn);
    animation: blinkpx 0.8s steps(2) infinite;
  }
</style>
