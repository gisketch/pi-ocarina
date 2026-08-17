<script lang="ts">
  import { asks, OTHER, type Flow } from '$lib/state/ask.svelte'
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
  const flow: Flow = $derived(asks.flow(askId, questions))
  const question = $derived(flow.question)

  /** What the reader has already said, for the steps above the current one. */
  function summary(one: AskQuestion): string {
    const chosen = flow.picked[one.id] ?? []
    const text = flow.typed[one.id] ?? ''
    if (one.kind === 'text') return text || '—'

    const titles = chosen.map(
      (id) => (id === OTHER ? text || 'something else' : one.choices?.find((choice) => choice.id === id)?.title) ?? id,
    )
    return titles.length > 0 ? titles.join(', ') : '—'
  }

  function submit(): void {
    if (settled) return
    onanswer?.(flow.answers())
  }

  function pick(index: number): void {
    if (settled) return
    flow.cursor = index
    flow.toggle()
    // A single-choice question with one step left is the common case; the
    // click says everything the reader had to say.
    if (question?.kind === 'one' && flow.last && flow.ready) submit()
    else if (question?.kind === 'one' && flow.ready) flow.step(1)
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

        {#if question.kind === 'text'}
          <div class="field" class:on={flow.typing}>
            <span class="typed">{flow.typed[question.id] ?? ''}</span><span class="caret"></span>
          </div>
        {:else}
          <div class="options">
            {#each question.choices ?? [] as choice, index (choice.id)}
              <button
                type="button"
                class="option"
                class:on={flow.cursor === index}
                class:picked={(flow.picked[question.id] ?? []).includes(choice.id)}
                onclick={() => pick(index)}
                aria-pressed={(flow.picked[question.id] ?? []).includes(choice.id)}
              >
                <span class="mark"
                  >{(flow.picked[question.id] ?? []).includes(choice.id) ? '■' : '□'}</span
                >
                <span class="body">
                  <span class="title">{choice.title}</span>
                  {#if choice.description}<span class="sub">{choice.description}</span>{/if}
                </span>
              </button>
            {/each}

            {#if question.allowOther}
              <button
                type="button"
                class="option"
                class:on={flow.cursor === -1}
                class:picked={(flow.picked[question.id] ?? []).includes(OTHER)}
                onclick={() => !settled && flow.other()}
              >
                <span class="mark"
                  >{(flow.picked[question.id] ?? []).includes(OTHER) ? '■' : '□'}</span
                >
                <span class="body">
                  <span class="title">Something else</span>
                  <span class="field inline" class:on={flow.typing && flow.cursor === -1}>
                    <span class="typed">{flow.typed[question.id] ?? ''}</span>
                    {#if flow.typing && flow.cursor === -1}<span class="caret"></span>{/if}
                  </span>
                </span>
              </button>
            {/if}
          </div>
        {/if}
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
      {#if flow.last}
        <button type="button" class="send" disabled={!flow.ready} onclick={submit}>send</button>
      {/if}
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

  .options {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 8px;
  }
  .option {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 7px;
    border: 1px solid transparent;
    background: transparent;
    font: inherit;
    font-size: 11.5px;
    color: var(--fg-body);
    text-align: left;
    cursor: pointer;
  }
  .option:hover {
    background: var(--bg-hover);
  }
  /* Where the cursor is, and what has been picked, are two different facts and
     read as two different marks. */
  .option.on {
    border-color: var(--accent-soft);
  }
  .option.picked {
    color: var(--fg-bright);
  }
  .mark {
    color: var(--accent);
    flex: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sub {
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }

  .field {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 8px;
    padding: 6px 9px;
    border: 1px solid var(--line-strong);
    font-size: 11.5px;
    color: var(--fg-bright);
    min-height: 30px;
  }
  .field.inline {
    margin-top: 2px;
    padding: 2px 0;
    border: none;
    min-height: 0;
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }
  .field.on {
    border-color: var(--accent-soft);
  }
  .caret {
    width: 6px;
    height: 13px;
    background: var(--accent);
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
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
