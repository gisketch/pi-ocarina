<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import { agentMark, agentTone, elapsedText } from '$lib/agent-row'
  import { clock } from '$lib/state/clock.svelte'
  import { agentPeek } from '$lib/state/agent-peek.svelte'
  import { tokensIn } from '../../../../shared/vocabulary'
  import { app } from '$lib/state/app.svelte'
  import { labelFor } from '$lib/tool-label'

  /** Looking inside one child while it runs.
   *
   *  The rows under a spawn call are the record; this is the monitor. It answers
   *  the question a row cannot: what has this child actually been doing, and is
   *  it stuck? The brief in full, every call it has made, and what it has cost.
   *
   *  It reads the thread each paint rather than holding a copy, so a child that
   *  is still working keeps moving underneath it. */
  const peeked = $derived(agentPeek.peeked)
  const running = $derived(peeked?.entry.status === 'running')

  $effect(() => {
    if (!running) return
    return clock.watch()
  })

  const elapsed = $derived.by(() => {
    const entry = peeked?.entry
    if (!entry) return ''
    return elapsedText((entry.endedAt ?? clock.now) - entry.startedAt)
  })

  const cost = $derived.by(() => {
    const usage = peeked?.entry.usage
    if (!usage) return ''
    const tokens = tokensIn(usage)
    return `${tokens.toLocaleString()} tokens · $${usage.cost.toFixed(4)}`
  })
</script>

{#if peeked}
  <div class="peek" role="dialog" aria-label="agent {peeked.entry.name}">
    <div class="head">
      <Identicon name={peeked.entry.name} hue={app.workspace.hue} size={12} />
      <span class="who">{peeked.entry.name}</span>
      <span class="role">{peeked.entry.role}</span>
      <span class="spacer"></span>
      {#if !running}
        <span class="mark {agentTone(peeked.entry.status)}">{agentMark(peeked.entry.status)}</span>
      {/if}
      <span class="clock">{elapsed}</span>
    </div>

    <p class="label">{peeked.entry.label}</p>

    <div class="calls">
      {#if peeked.rows.length === 0}
        <p class="empty">nothing yet</p>
      {:else}
        {#each peeked.rows as row (row.id)}
          <div class="call" class:live={row.status === 'running'}>
            <span class="kind">{labelFor(row.kind, row.status)}</span>
            <span class="target">{row.agent ? row.agent.name : row.target}</span>
          </div>
        {/each}
      {/if}
    </div>

    {#if peeked.entry.output}
      <p class="report">{peeked.entry.output}</p>
    {/if}

    <div class="foot">
      <span class="cost">{cost}</span>
      <span class="spacer"></span>
      <!-- `x` is destructive inside a surface that is otherwise only for
           looking, so it confirms before it stops anything. -->
      <span class="keys">{running ? 'x stop · h close' : 'h close'}</span>
    </div>
  </div>
{/if}

<style>
  .peek {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 40;
    width: min(420px, calc(100% - 32px));
    max-height: 60%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--bg-panel);
    border: 1px solid var(--line-strong);
    font-size: 11.5px;
    color: var(--fg-body);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .head :global(.sigil) {
    flex: none;
  }
  .who {
    color: var(--fg-bright);
  }
  .role,
  .cost,
  .keys {
    color: var(--fg-dimmer);
    font-size: 10.5px;
  }
  .spacer {
    flex: 1;
  }
  .clock {
    font-variant-numeric: tabular-nums;
    color: var(--fg-dimmer);
  }
  .mark.ok {
    color: var(--ok);
  }
  .mark.fail {
    color: var(--err);
  }
  .mark.warn {
    color: var(--warn);
  }
  .label {
    margin: 0;
    color: var(--fg-body);
  }
  /* The calls are the reason the peek exists, so they get the room and the
     scroll; everything else is one line. */
  .calls {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-top: 1px solid var(--line-mid);
    border-bottom: 1px solid var(--line-mid);
    padding: 6px 0;
  }
  .call {
    display: flex;
    gap: 8px;
    font-size: 10.5px;
    color: var(--fg-dim);
  }
  .call.live {
    color: var(--fg-bright);
  }
  .call .kind {
    flex: none;
    color: var(--fg-dimmer);
  }
  .call .target {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty,
  .report {
    margin: 0;
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }
  .report {
    max-height: 6lh;
    overflow-y: auto;
    white-space: pre-wrap;
  }
  .foot {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
</style>
