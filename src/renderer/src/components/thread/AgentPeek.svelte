<script lang="ts">
  import Icon from '../Icon.svelte'
  import Identicon from '../Identicon.svelte'
  import Message from './Message.svelte'
  import AgentRow from './AgentRow.svelte'
  import ToolLine from './ToolLine.svelte'
  import { agentMark, agentTone, elapsedText } from '$lib/agent-row'
  import { nodeTone } from '$lib/ledger'
  import { toolIcon } from '$lib/icons'
  import { clock } from '$lib/state/clock.svelte'
  import { agentPeek } from '$lib/state/agent-peek.svelte'
  import { tokensIn } from '../../../../shared/vocabulary'
  import { app } from '$lib/state/app.svelte'
  import type { ToolRow } from '$lib/thread'

  /** Looking inside one child while it runs.
   *
   *  The rows under a spawn call are the record; this is the monitor. It answers
   *  the question a row cannot: what has this child actually been doing, is it
   *  stuck, what is it running on, and what has it cost so far.
   *
   *  It is drawn as a floating column rather than as a corner card, because the
   *  thing it holds *is* a small transcript — a brief, a run of calls, a report
   *  — and a tooltip-sized box made a fan-out's most detailed surface its least
   *  readable one. It floats rather than covering: the strip keeps streaming
   *  behind it, dimmed a step, and every key it does not claim still reaches the
   *  shell.
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
    return `${tokensIn(usage).toLocaleString()} tokens · $${usage.cost.toFixed(4)}`
  })

  /** The last segment of a provider-qualified id. The provider is the same for
   *  every child in practice, and the part that distinguishes one model from
   *  another is the tail; the full id is on the title. */
  const modelShort = $derived(peeked?.entry.model?.split('/').at(-1) ?? '')
</script>

<!-- One row of the child's own ledger, drawn with the transcript's grammar so
     the peek and the column say the same thing about the same call. Its tones
     and icons come from the shared mapping; only the geometry is local, since
     there is no spine to hang a node on in here. -->
{#snippet call(row: ToolRow, nested: boolean)}
  <div class="entry" class:nested>
    <span class="node {nodeTone(row)}" class:pulse={row.status === 'running'}>
      <Icon name={toolIcon(row.kind, row.lang)} />
    </span>
    <span class="line">
      {#if row.agent}
        <AgentRow agent={row.agent} hue={app.workspace.hue} rows={row.children} />
      {:else}
        <ToolLine {row} />
      {/if}
    </span>
  </div>
  {#if row.children?.length && !nested}
    {#each row.children as child (child.id)}
      {@render call(child, true)}
    {/each}
  {/if}
{/snippet}

{#if peeked}
  <!-- The dim is a background step, not a border, and it does not blur: the
       reader opened this to watch a fan-out that is still running behind it. -->
  <div
    class="scrim"
    role="presentation"
    onclick={() => agentPeek.close()}
    onkeydown={() => {}}
  ></div>

  <div class="peek" role="dialog" aria-label="agent {peeked.entry.name}">
    <div class="head">
      <Identicon name={peeked.entry.name} hue={app.workspace.hue} size={13} />
      <span class="who">{peeked.entry.name}</span>
      <span class="role">{peeked.entry.role}</span>
      {#if modelShort}
        <span class="model" title={peeked.entry.model}>{modelShort}</span>
      {/if}
      <span class="spacer"></span>
      {#if !running}
        <span class="mark {agentTone(peeked.entry.status)}">{agentMark(peeked.entry.status)}</span>
      {/if}
      <span class="clock">{elapsed}</span>
    </div>

    <div class="body">
      <div class="brief">
        <div class="tag">BRIEF</div>
        <p>{peeked.entry.label}</p>
      </div>

      <div class="calls">
        {#if peeked.rows.length === 0}
          <p class="empty">nothing yet</p>
        {:else}
          {#each peeked.rows as row (row.id)}
            {@render call(row, false)}
          {/each}
        {/if}
      </div>

      {#if peeked.entry.output}
        <div class="report">
          <div class="tag">REPORT</div>
          <!-- The child's report is prose it wrote, so it is read the way every
               other piece of agent prose in the app is read. -->
          <Message role="agent" text={peeked.entry.output} labelled={false} />
          {#if peeked.entry.truncated}
            <p class="cut">report cut at the per-child cap</p>
          {/if}
        </div>
      {/if}
    </div>

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
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 39;
    background: rgba(8, 8, 10, 0.5);
    animation: fade 0.15s ease;
  }

  /* A column, not a card: what it holds is a small transcript, and the width
     the rest of the app reads a transcript at is the width this reads at. */
  .peek {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 40;
    width: min(680px, 78vw);
    /* Grows with the child rather than reserving a column of empty room: a
       peek opened on a child that has made two calls is two calls tall. It
       still has a floor, so the first call does not open a box the size of a
       tooltip, and a ceiling, so a noisy child scrolls instead of running off
       the screen. */
    min-height: min(320px, 46vh);
    max-height: min(660px, 76vh);
    display: flex;
    flex-direction: column;
    background: var(--bg-float);
    font-size: 11.5px;
    color: var(--fg-body);
    animation: rise 0.16s ease;
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 10px 14px;
    background: var(--bg-header);
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
  /* The one fact that most often explains a slow or expensive child, so it is
     in the header rather than folded into the footer's figures. */
  .model {
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dim);
    background: var(--bg-chip);
    padding: 1px 6px;
    max-width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* One scroll for the whole transcript rather than one per region: a reader
     following a child reads down it, and three independent scrollbars made
     the report unreachable without finding the right one first. */
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
  }

  .tag {
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
    margin-bottom: 6px;
  }
  .brief p {
    margin: 0;
    color: var(--fg-body);
    line-height: 1.6;
  }

  /* The calls are the reason the peek exists, so they take the room the report
     is not using. A step down from the dialog's ground is what separates them
     from it — no rule, per the borderless contract. */
  .calls {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: rgba(255, 255, 255, 0.03);
    padding: 10px 12px;
  }
  .entry {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  /* One indent, no rule: the ledger's own nesting reads the same way. */
  .entry.nested {
    padding-left: var(--pad-nest, 18px);
  }
  .node {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    align-self: center;
  }
  .node.pulse {
    animation: pulse 1.1s ease-in-out infinite;
  }
  .line {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 10.5px;
    color: var(--fg-dim);
  }

  .empty,
  .cut {
    margin: 0;
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }
  .cut {
    margin-top: 8px;
  }

  .foot {
    flex: none;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 9px 14px;
    background: var(--bg-header);
  }
</style>
