<script lang="ts">
  import { OTHER, type Flow } from '$lib/state/ask.svelte'
  import type { AskQuestion } from '$lib/thread'

  /** The rows of one question: its choices, its free-text option, or the field
   *  a `text` question is. Split from the card so the card is the stepper and
   *  this is the question — and so a fourth kind of question is a change here
   *  and nowhere else. */
  const {
    flow,
    question,
    onpick,
  }: { flow: Flow; question: AskQuestion; onpick: (index: number) => void } = $props()

  /** A key typed into a field is the field's, and the strip behind it must not
   *  see it: `j` in a branch name is a letter, not a cursor move. `esc` still
   *  travels, because leaving is the shell's to decide. */
  function held(event: KeyboardEvent): void {
    if (event.key !== 'Escape') event.stopPropagation()
  }

  const picked = $derived(flow.picked[question.id] ?? [])
  const typed = $derived(flow.typed[question.id] ?? '')
</script>

{#if question.kind === 'text'}
  <!-- A real input, so a reader who never touches the keyboard shortcuts can
       still answer. Focusing it tells the flow the caret is here, which is what
       keeps `j` from moving a cursor underneath it. -->
  <input
    class="field"
    value={typed}
    placeholder="type your answer"
    aria-label={question.prompt}
    oninput={(event) => flow.write(event.currentTarget.value)}
    onfocus={() => (flow.typing = true)}
    onkeydown={held}
  />
{:else}
  <div class="options">
    {#each question.choices ?? [] as choice, index (choice.id)}
      <button
        type="button"
        class="option"
        class:on={flow.cursor === index}
        class:picked={picked.includes(choice.id)}
        onclick={() => onpick(index)}
        aria-pressed={picked.includes(choice.id)}
      >
        <span class="mark">{picked.includes(choice.id) ? '■' : '□'}</span>
        <span class="body">
          <span class="title">{choice.title}</span>
          {#if choice.description}<span class="sub">{choice.description}</span>{/if}
        </span>
      </button>
    {/each}

    {#if question.allowOther}
      <div class="option other" class:on={flow.cursor === -1} class:picked={picked.includes(OTHER)}>
        <button type="button" class="mark" aria-label="something else" onclick={() => flow.other()}>
          {picked.includes(OTHER) ? '■' : '□'}
        </button>
        <span class="body">
          <span class="title">Something else</span>
          <input
            class="field inline"
            value={typed}
            placeholder="…"
            aria-label="something else"
            oninput={(event) => flow.write(event.currentTarget.value)}
            onfocus={() => flow.other()}
            onkeydown={held}
          />
        </span>
      </div>
    {/if}
  </div>
{/if}

<style>
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
  .other {
    cursor: default;
  }
  .mark {
    border: none;
    background: transparent;
    font: inherit;
    color: var(--accent);
    flex: none;
    padding: 0;
    cursor: pointer;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .sub {
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }

  .field {
    display: block;
    width: 100%;
    margin-top: 8px;
    padding: 6px 9px;
    border: 1px solid var(--line-strong);
    background: transparent;
    font: inherit;
    font-size: 11.5px;
    color: var(--fg-bright);
  }
  .field:focus {
    outline: none;
    border-color: var(--accent-soft);
  }
  .field.inline {
    margin-top: 2px;
    padding: 2px 0;
    border: none;
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }
</style>
