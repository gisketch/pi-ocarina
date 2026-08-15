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
    border: 1px solid rgba(224, 122, 107, 0.28);
    background: var(--err-soft);
    font-family: var(--font-body);
    font-size: 12px;
  }
  .error.interrupted {
    border-color: rgba(233, 196, 106, 0.28);
    background: var(--warn-soft);
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
    border: 1px solid var(--line-strong);
    background: none;
    color: var(--fg-dim);
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
