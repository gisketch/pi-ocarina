<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import { agentMark, agentTone } from '$lib/agent-row'
  import type { AgentEntry } from '$lib/thread'

  /** One child agent, as a row under the call that spawned it.
   *
   *  Everything left of the last cell is written once and never moves: sigil,
   *  name, role, label. The last cell is the only live part — what the child is
   *  doing now, replaced by a mark and its final duration when it settles. A
   *  reader learns that the left half is identity and the right half is
   *  activity, and a second passing repaints one text node.
   *
   *  Split from `Ledger.svelte` because an agent row is a different grammar
   *  from a tool row, not a tool row with extra fields — and because the ledger
   *  had no room left. */
  const {
    agent,
    hue,
    live,
  }: {
    agent: AgentEntry
    /** The workspace's own hue: a child reads as belonging where it runs. */
    hue: number
    /** What the child is doing now and for how long, already formatted. Absent
     *  once it has settled. */
    live?: { doing: string; elapsed: string }
  } = $props()
</script>

<span class="agent">
  <Identicon name={agent.name} {hue} size={10} />
  <span class="who">{agent.name}</span>
  <span class="role">{agent.role}</span>
  <span class="label">{agent.label}</span>
  {#if agent.status === 'running' && live}
    <span class="cell">
      <span class="doing">{live.doing}</span>
      <span class="clock">{live.elapsed}</span>
    </span>
  {:else}
    <span class="cell settled {agentTone(agent.status)}">
      <span class="mark">{agentMark(agent.status)}</span>
    </span>
  {/if}
</span>

<style>
  .agent {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
    width: 100%;
  }
  /* The sigil sits on the text baseline rather than above it, so a row of
     children reads as one line each. */
  .agent :global(.sigil) {
    align-self: center;
  }
  .who {
    color: var(--fg-bright);
    flex: none;
  }
  .role {
    color: var(--fg-dimmer);
    flex: none;
  }
  /* The assignment takes what is left and truncates; the live cell never does,
     because a cut-off status is worse than a cut-off brief. */
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-body);
  }
  .cell {
    flex: none;
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--fg-dim);
  }
  .doing {
    max-width: 18ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Tabular figures, so a second passing never reflows the row. */
  .clock {
    font-variant-numeric: tabular-nums;
    color: var(--fg-dimmer);
  }
  .settled.ok .mark {
    color: var(--ok);
  }
  .settled.fail .mark {
    color: var(--err);
  }
  .settled.warn .mark {
    color: var(--warn);
  }
</style>
