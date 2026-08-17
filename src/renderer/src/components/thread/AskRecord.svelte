<script lang="ts">
  import { describeAnswer } from '$lib/state/ask.svelte'
  import type { AskAnswer, AskQuestion } from '$lib/thread'

  /** What an answered card is: the questions that were asked, and what was said
   *  to each. Read from the answers rather than from the flow, so a card
   *  rendered out of history says the same thing as one answered a moment ago. */
  const { questions, answers }: { questions: AskQuestion[]; answers?: AskAnswer[] } = $props()

  function answered(one: AskQuestion): string {
    const said = answers?.find((entry) => entry.id === one.id)
    if (!said || said.skipped) return 'skipped'

    return describeAnswer(one, said.chosen, said.text ?? '')
  }
</script>

{#each questions as one (one.id)}
  <div class="done">
    <span class="prompt">{one.prompt}</span>
    <span class="value">{answered(one)}</span>
  </div>
{/each}

<style>
  .done {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 6px 12px;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
    color: var(--fg-dimmer);
    text-align: left;
  }
  .done:last-child {
    border-bottom: none;
  }
  .value {
    margin-left: auto;
    color: var(--fg-dim);
    text-align: right;
  }
</style>
