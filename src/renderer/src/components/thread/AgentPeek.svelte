<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import Message from './Message.svelte'
  import Ledger from './Ledger.svelte'
  import { agentMark, agentTone, elapsedText } from '$lib/agent-row'
  import { clock } from '$lib/state/clock.svelte'
  import { agentPeek } from '$lib/state/agent-peek.svelte'
  import { tokensIn } from '../../../../shared/vocabulary'
  import { app } from '$lib/state/app.svelte'

  /** Looking inside one child while it runs.
   *
   *  The rows under a spawn call are the record; this is the monitor. It answers
   *  the question a row cannot: what has this child actually been doing, is it
   *  stuck, what is it running on, and what has it cost so far.
   *
   *  It is drawn as a floating chat column, with the chat column's own pieces:
   *  the brief and the report are `Message`s, the calls are a `Ledger`. Not a
   *  copy of their grammar — the components themselves, so the peek and the
   *  column can never disagree about what a call looks like. Under an empty
   *  thread id: the peek is not a place `j` can reach, so its rows must not
   *  register as stops in the real thread, and nothing under '' is ever asked.
   *
   *  It floats rather than covering: the strip keeps streaming behind it,
   *  dimmed a step, and every key it does not claim still reaches the shell.
   *  It reads the thread each paint rather than holding a copy, so a child
   *  that is still working keeps moving underneath it. */
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

  let body = $state<HTMLElement | null>(null)

  /** Follows the child the way the column follows a turn: opened at the
   *  bottom, and pinned there while new rows land — unless the reader has
   *  scrolled up to read something, in which case the transcript stays put
   *  under them. Near-bottom is the whole test the column's follow uses too. */
  const nearBottom = (box: HTMLElement): boolean =>
    box.scrollHeight - box.scrollTop - box.clientHeight < 48

  $effect(() => {
    const id = peeked?.entry.id
    void id
    const box = body
    if (!box) return
    // A fresh peek starts at the bottom: the newest call is the question.
    requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight
    })
  })

  $effect(() => {
    const grew = peeked?.rows.length ?? 0
    const said = peeked?.entry.output?.length ?? 0
    void grew
    void said
    const box = body
    if (!box || !nearBottom(box)) return
    requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight
    })
  })
</script>

{#if peeked}
  <!-- The dim is a background step, not a border, and it does not blur: the
       reader opened this to watch a fan-out that is still running behind it. -->
  <div
    class="scrim"
    role="presentation"
    onclick={() => agentPeek.close()}
    onkeydown={() => {}}
  ></div>

  <!-- Centered by the wrapper, animated on the panel: `rise` owns `transform`
       for its first frames, so a panel centering itself with a translate was
       drawn un-centered until the animation ended, then snapped into place. -->
  <div class="wrap">
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
          <span class="mark {agentTone(peeked.entry.status)}"
            >{agentMark(peeked.entry.status)}</span
          >
        {/if}
        <span class="clock">{elapsed}</span>
      </div>

      <div class="body" bind:this={body}>
        <!-- The orchestrator's brief reads as the sent message it is. -->
        <Message role="user" text={peeked.entry.label} labelled={false} />

        {#if peeked.rows.length === 0}
          <p class="empty">nothing yet</p>
        {:else}
          <div class="calls">
            <Ledger
              rows={peeked.rows}
              threadId=""
              blockId="peek:{peeked.entry.id}"
              focusedNav={null}
              hue={app.workspace.hue}
            />
          </div>
        {/if}

        {#if peeked.entry.output}
          <Message role="agent" text={peeked.entry.output} labelled={false} />
          {#if peeked.entry.truncated}
            <p class="cut">report cut at the per-child cap</p>
          {/if}
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

  /* The wrapper owns position, the panel owns its entrance: the two cannot
     share, because the animation writes `transform` and would override a
     centering translate for as long as it runs. */
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  /* A column, not a card: what it holds is a small transcript, and the width
     the rest of the app reads a transcript at is the width this reads at. It
     grows with the child between a floor and a ceiling rather than reserving
     a column of empty room. */
  .peek {
    pointer-events: auto;
    width: min(680px, 78vw);
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

  /* One scroll for the whole transcript, the way the column has one. The
     horizontal padding is the column's own, which is also what the ledger's
     spine geometry is measured from. */
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px var(--pad-column);
  }

  /* The ledger's spine geometry is measured from its own box under the
     column's rule that pads every block by `--pad-column`. The peek's body
     pads everything the same way, so the ledger box is widened back out to
     the panel edge and handed that same padding — the geometry in
     `tokens.css` then holds without change. */
  .calls {
    margin: 0 calc(-1 * var(--pad-column));
  }
  .calls > :global(.ledger) {
    padding-inline: var(--pad-column);
  }

  .empty,
  .cut {
    margin: 0;
    font-size: 10.5px;
    color: var(--fg-dimmer);
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
