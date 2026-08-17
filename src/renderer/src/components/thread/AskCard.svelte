<script lang="ts">
  import type { AskAnswer, AskOutcome, AskQuestion } from '$lib/thread'

  interface Props {
    questions: AskQuestion[]
    /** Undefined while the question is still waiting on someone. */
    outcome?: AskOutcome
    answers?: AskAnswer[]
    /** The message that replaced the question, when it was cancelled. */
    said?: string
    /** What ended it, when the turn did. */
    reason?: string
    /** Absent in the demo catalog, which has no session to answer to. */
    onanswer?: (answers: AskAnswer[]) => void
  }

  const { questions, outcome, answers, said, reason, onanswer }: Props = $props()

  // A click shows immediately; the thread's own `ask-answered` event is what
  // makes it true.
  let picked = $state<Record<string, string>>({})
  const settled = $derived(outcome !== undefined)

  function answer(question: AskQuestion, choiceId: string): void {
    if (settled) return

    picked = { ...picked, [question.id]: choiceId }
    const chosen = questions
      .map((one) => ({ one, id: picked[one.id] }))
      .filter((entry): entry is { one: AskQuestion; id: string } => entry.id !== undefined)
    // Every question, once every one that can be answered by clicking has been.
    // The stepper is L4's; this is the one path the demo needs.
    if (chosen.length !== questions.filter((one) => one.kind !== 'text').length) return

    onanswer?.(
      questions.map((one) => {
        const id = picked[one.id]
        const choice = one.choices?.find((candidate) => candidate.id === id)
        if (!choice) return { id: one.id, kind: one.kind, chosen: [], labels: [], skipped: true }
        return { id: one.id, kind: one.kind, chosen: [choice.id], labels: [choice.title] }
      }),
    )
  }

  function chosenIn(questionId: string): string | undefined {
    const said = answers?.find((one) => one.id === questionId)
    return said?.chosen[0] ?? picked[questionId]
  }
</script>

<div class="ask">
  <div class="head">
    <span class="tag">? ASK</span>
    <span class="count">{questions.length} question{questions.length === 1 ? '' : 's'}</span>
    <span class="status">
      {#if outcome === 'answered'}answered ✓
      {:else if outcome === 'cancelled'}answered in the composer
      {:else if outcome === 'ended'}unanswered — {reason ?? 'the turn ended'}
      {:else}awaiting input{/if}
    </span>
  </div>

  {#if said}
    <div class="said">{said}</div>
  {/if}

  {#each questions as question (question.id)}
    <div class="question">
      <div class="prompt">{question.prompt}</div>
      {#if question.description}
        <div class="note">{question.description}</div>
      {/if}

      {#if question.kind === 'text'}
        <div class="typed">
          {answers?.find((one) => one.id === question.id)?.text ?? '—'}
        </div>
      {:else}
        <div class="options">
          {#each question.choices ?? [] as choice (choice.id)}
            <button
              type="button"
              class="option"
              class:selected={chosenIn(question.id) === choice.id}
              class:dimmed={settled && chosenIn(question.id) !== choice.id}
              onclick={() => answer(question, choice.id)}
              aria-pressed={chosenIn(question.id) === choice.id}
            >
              <span class="mark">{chosenIn(question.id) === choice.id ? '■' : '□'}</span>
              <span class="body">
                <span class="title">{choice.title}</span>
                {#if choice.description}<span class="sub">{choice.description}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  {#if !settled}
    <div class="hint">click to answer · or reply in composer</div>
  {/if}
</div>

<style>
  .ask {
    border: 1px solid var(--line);
    background: var(--bg-raise-2);
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

  .question {
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
  }
  .question:last-of-type {
    border-bottom: none;
  }
  .prompt {
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
    gap: 4px;
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
  .option.selected {
    border-color: var(--accent-soft);
    color: var(--fg-bright);
  }
  .option.dimmed {
    color: var(--fg-dimmest);
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
  /* The description is subtext, not a second line of the title: lighter and
     smaller, so a list of real choices stays scannable. */
  .sub {
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }

  .typed {
    margin-top: 8px;
    font-size: 11.5px;
    color: var(--fg-bright);
  }

  .hint {
    padding: 6px 12px 9px;
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
</style>
