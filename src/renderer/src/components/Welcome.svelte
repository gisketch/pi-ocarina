<script lang="ts">
  import { catalog } from '$lib/state/catalog.svelte'

  // The picker is native and modal, so a second click while it is open would
  // queue a second dialog behind the first.
  let pinning = $state(false)

  async function pin(): Promise<void> {
    if (pinning) return
    pinning = true
    try {
      await catalog.pin()
    } finally {
      pinning = false
    }
  }
</script>

<section class="welcome">
  <div class="card">
    <span class="wordmark">PI<span class="wordmark-dim">OCARINA</span></span>

    <p class="line">a keyboard-first desk for the pi coding agent</p>

    <button type="button" class="action" onclick={pin} disabled={pinning}>
      <span class="key">⏎</span>
      pin a folder to start
    </button>

    {#if catalog.error}
      <p class="error">{catalog.error}</p>
    {/if}

    <p class="hint">
      <span class="key">?</span> keymap · <span class="key">␣</span> leader
    </p>
  </div>
</section>

<style>
  .welcome {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding: 40px 52px;
    background: var(--bg-raise-3);
  }

  .wordmark {
    font-size: 22px;
    letter-spacing: 0.04em;
    color: var(--fg-bright);
  }
  .wordmark-dim {
    color: var(--fg-dimmer);
  }

  .line {
    margin: 0;
    font-size: 11.5px;
    color: var(--fg-dim);
  }

  .action {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 17px;
    background: var(--bg-chip);
    color: var(--fg-dim);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
    transition:
      color 0.15s,
      background 0.15s;
  }
  .action:not(:disabled):hover {
    color: var(--fg-bright);
    background: oklch(0.76 0.14 var(--accent-hue) / 0.15);
  }
  .action:disabled {
    cursor: default;
    color: var(--fg-dimmer);
  }

  .error {
    margin: 0;
    font-size: 11px;
    color: var(--err-text);
    max-width: 34ch;
    text-align: center;
  }

  .hint {
    margin: 0;
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }

  .key {
    color: var(--fg-muted);
  }
</style>
