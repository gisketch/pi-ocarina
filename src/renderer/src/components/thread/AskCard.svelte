<script lang="ts">
  import { asks, describeAnswer, type Flow } from '$lib/state/ask.svelte'
  import AskChoices from './AskChoices.svelte'
  import AskRecord from './AskRecord.svelte'
  import type { AskAnswer, AskOutcome, AskQuestion } from '$lib/thread'

  interface Props {
    askId: string
    questions: AskQuestion[]
    /** Undefined while the question is still waiting on someone. */
    outcome?: AskOutcome
    answers?: AskAnswer[]
    /** The message that replaced the question, when it was cancelled. */
    said?: string
    /** What ended it, when the turn did. */
    reason?: string
    /** Whether this card currently holds the column's keys. */
    focused?: boolean
    /** Absent in the demo catalog, which has no session to answer to. */
    onanswer?: (answers: AskAnswer[]) => void
  }

  const {
    askId,
    questions,
    outcome,
    answers,
    said,
    reason,
    focused = false,
    onanswer,
  }: Props = $props()

  const settled = $derived(outcome !== undefined)
  // A settled card renders its record and never reads the flow. Asking for one
  // would rebuild what `applyAskEffects` just threw away, once per repaint.
  const flow: Flow = $derived(settled ? asks.spare(questions) : asks.flow(askId, questions))
  const question = $derived(flow.question)

  /** What the reader has already said, for the steps above the current one. */
  function summary(one: AskQuestion): string {
    return describeAnswer(one, flow.picked[one.id] ?? [], flow.typed[one.id] ?? '')
  }

  /** The pointer's version of `enter`: take the step, or send if this was the
   *  last. One seam with the keys, so the two paths cannot answer differently
   *  — the keyboard's is `askKeys`, and both end here. */
  function advance(): void {
    if (settled || !flow.ready) return
    if (!flow.last) {
      flow.step(1)
      return
    }
    onanswer?.(flow.answers())
  }

  function pick(index: number): void {
    if (settled) return
    flow.cursor = index
    flow.toggle()
    // A single-choice question answers itself on a click: there is nothing
    // else the reader was going to say about it.
    if (question?.kind === 'one') advance()
  }
</script>

<div class="ask" class:focused={focused && !settled}>
  <div class="head">
    <span class="tag">? ASK</span>
    {#if !settled}
      <span class="step">{flow.at + 1} / {questions.length}</span>
    {/if}
    <span class="status">
      {#if outcome === 'answered'}answered ✓
      {:else if outcome === 'cancelled'}answered in the composer
      {:else if outcome === 'ended'}unanswered — {reason ?? 'the turn ended'}
      {:else if focused}awaiting input
      {:else}awaiting input · enter{/if}
    </span>
  </div>

  {#if said}
    <div class="said">{said}</div>
  {/if}

  {#if settled}
    <AskRecord {questions} {answers} />
  {:else}
    {#each questions.slice(0, flow.at) as one (one.id)}
      <button type="button" class="done past" onclick={() => flow.step(-(flow.at - questions.indexOf(one)))}>
        <span class="prompt">{one.prompt}</span>
        <span class="value">{summary(one)}</span>
      </button>
    {/each}

    {#if question}
      <div class="question">
        <div class="prompt now">{question.prompt}</div>
        {#if question.description}
          <div class="note">{question.description}</div>
        {/if}

        <AskChoices {flow} {question} onpick={pick} />
      </div>
    {/if}

    <div class="keys">
      {#if flow.at > 0}<span><span class="key">⇧tab</span> back</span>{/if}
      <span><span class="key">j/k</span> move</span>
      {#if question?.kind === 'many'}<span><span class="key">space</span> toggle</span>{/if}
      {#if question?.allowOther}<span><span class="key">o</span> something else</span>{/if}
      <span>
        <span class="key">⏎</span>
        {flow.last ? 'send answers' : 'next'}
      </span>
      <!-- The pointer needs a way past a `many` or `text` question: nothing
           auto-advances there, and a card with no button is a dead end for
           anyone not using the keys. -->
      <button type="button" class="send" disabled={!flow.ready} onclick={advance}>
        {flow.last ? 'send' : 'next'}
      </button>
    </div>
  {/if}
</div>

<style>
  .ask {
    border: 1px solid var(--line);
    background: var(--bg-raise-2);
  }
  /* The card that has the keys says so with its edge, quietly — the reader is
     reading a question, not looking for a highlight. */
  .ask.focused {
    border-color: var(--accent-soft);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--fg-dimmest);
  }
  .tag {
    color: var(--warn, var(--accent));
  }
  .status {
    margin-left: auto;
  }

  .said {
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--fg-dim);
    font-style: italic;
  }

  .done {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    border-bottom: 1px solid var(--line);
    background: transparent;
    font: inherit;
    font-size: 11px;
    color: var(--fg-dimmer);
    text-align: left;
  }
  .done.past {
    cursor: pointer;
  }
  .done .value {
    margin-left: auto;
    color: var(--fg-dim);
    text-align: right;
  }

  .question {
    padding: 10px 12px;
  }
  .prompt {
    font-size: 11.5px;
  }
  .prompt.now {
    font-size: 12px;
    color: var(--fg-body);
  }
  .note {
    margin-top: 3px;
    font-size: 11px;
    color: var(--fg-dimmer);
  }



  .keys {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 12px 9px;
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
  .key {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
  .send {
    margin-left: auto;
    padding: 3px 10px;
    border: 1px solid var(--accent-soft);
    background: transparent;
    font: inherit;
    font-size: 10.5px;
    color: var(--fg-bright);
    cursor: pointer;
  }
  .send:disabled {
    border-color: var(--line);
    color: var(--fg-ghost);
    cursor: default;
  }
</style>
