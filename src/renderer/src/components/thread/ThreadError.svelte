<script lang="ts">
  /** Shown when a turn ended badly and the user has to decide what happens next.
   *
   *  pi retries transient provider failures on its own, so anything that
   *  reaches here has already run out of automatic attempts. The retry is a
   *  whole-turn retry, because that is the only retry pi offers — there is no
   *  way to re-run a single tool call. */
  interface Props {
    /** `failed` after a turn broke; `interrupted` after a relaunch mid-turn. */
    state: 'failed' | 'interrupted'
    reason?: string
    onretry?: () => void
  }

  const { state, reason, onretry }: Props = $props()

  const label = $derived(state === 'failed' ? 'TURN FAILED' : 'TURN INTERRUPTED')
  const detail = $derived(
    reason ?? (state === 'failed' ? 'the turn ended badly' : 'the app closed while this was running'),
  )
</script>

<div class="error" class:interrupted={state === 'interrupted'}>
  <span class="tag">! {label}</span>
  <span class="detail">{detail}</span>
  {#if onretry}
    <button type="button" onclick={onretry}>retry</button>
  {/if}
</div>

<style>
  .error {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 9px 12px;
    background: rgba(224, 122, 107, 0.09);
    font-family: var(--font-body);
    font-size: 12px;
  }
  .error.interrupted {
    background: rgba(233, 196, 106, 0.07);
  }

  .tag {
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--err);
    flex: none;
  }
  .interrupted .tag {
    color: var(--warn);
  }

  .detail {
    color: var(--fg-agent);
  }

  button {
    margin-left: auto;
    flex: none;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 10.5px;
    font-family: var(--font-chrome);
    border: none;
    background: rgba(255, 255, 255, 0.06);
    color: var(--fg-dim);
    transition:
      background 0.15s,
      color 0.15s;
  }
  button:hover {
    background: oklch(0.76 0.14 var(--accent-hue) / 0.15);
    color: var(--accent);
  }
</style>
