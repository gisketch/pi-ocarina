<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import { agentMark, agentTone, doingIn, elapsedText } from '$lib/agent-row'
  import { agentClock } from '$lib/state/agent-clock.svelte'
  import type { AgentEntry, ToolRow } from '$lib/thread'

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
  // `rows` rather than `children`: Svelte 5 reserves that name for a snippet,
  // and a prop that shadows it reads as content the component never renders.
  const {
    agent,
    hue,
    rows,
  }: {
    agent: AgentEntry
    /** The workspace's own hue: a child reads as belonging where it runs. */
    hue: number
    /** The child's own rows, which is where "what it is doing now" comes from. */
    rows?: ToolRow[]
  } = $props()

  const running = $derived(agent.status === 'running')

  // Only a running row watches the clock, and it stops watching the moment it
  // settles — so an app with nothing running holds no timer at all.
  $effect(() => {
    if (!running) return
    return agentClock.watch()
  })

  const doing = $derived(running ? doingIn(agent, rows) : '')
  // Read here, in the leaf that draws it: a second passing repaints this text
  // node rather than the row, the ledger, or the transcript.
  const elapsed = $derived(
    running ? elapsedText(agentClock.now - agent.startedAt) : elapsedText(finished()),
  )

  function finished(): number {
    return (agent.endedAt ?? agent.startedAt) - agent.startedAt
  }
</script>

<span class="agent">
  <Identicon name={agent.name} {hue} size={10} />
  <span class="who">{agent.name}</span>
  <span class="role">{agent.role}</span>
  <span class="label">{agent.label}</span>
  {#if running}
    <span class="cell">
      <span class="doing">{doing}</span>
      <span class="clock">{elapsed}</span>
    </span>
  {:else}
    <span class="cell settled {agentTone(agent.status)}">
      <span class="mark">{agentMark(agent.status)}</span>
      <span class="clock">{elapsed}</span>
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
