<script lang="ts">
  import type { AskOption } from '$lib/thread'

  interface Props {
    question: string
    options: AskOption[]
  }

  const { question, options }: Props = $props()

  // Answering is local in the static shell; the session backend takes the answer later.
  let selected = $state<number | null>(null)
</script>

<div class="ask">
  <div class="head">
    <span class="tag">? ASK</span>
    <span class="question">{question}</span>
    <span class="status">{selected === null ? 'awaiting input' : 'answered ✓'}</span>
  </div>

  <div class="options">
    {#each options as option, i (option.label)}
      <button
        type="button"
        class="option"
        class:selected={selected === i}
        class:dimmed={selected !== null && selected !== i}
        onclick={() => (selected = i)}
        aria-pressed={selected === i}
      >
        <span class="mark">{selected === i ? '■' : '□'}</span>{option.label}
      </button>
    {/each}
    <div class="hint">click to answer · or reply in composer</div>
  </div>
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
    padding: 9px 12px;
    border-bottom: 1px solid var(--line-faint);
  }
  .tag {
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--accent);
    flex: none;
  }
  .question {
    color: var(--fg);
    font-size: 12px;
    font-family: var(--font-body);
  }
  .status {
    margin-left: auto;
    color: var(--fg-dimmest);
    font-size: 10px;
    font-family: var(--font-chrome);
    white-space: nowrap;
  }

  .options {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    cursor: pointer;
    border: 1px solid var(--bg-chip);
    background: transparent;
    color: var(--fg-agent);
    font-size: 12px;
    font-family: var(--font-body);
    text-align: left;
    /* Explicit rather than `all`: nothing here may animate a layout property. */
    transition:
      background-color 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .option:hover {
    border-color: rgba(255, 255, 255, 0.2);
  }
  .option.selected {
    border-color: oklch(0.76 0.14 var(--accent-hue) / 0.5);
    background: var(--accent-soft);
    color: var(--fg-bright);
  }
  .option.dimmed {
    color: var(--fg-dimmer);
  }

  .mark {
    width: 12px;
    flex: none;
    color: var(--fg-dimmest);
  }
  .option.selected .mark {
    color: var(--accent);
  }

  .hint {
    padding: 6px 10px 2px;
    color: var(--fg-dimmest);
    font-size: 10px;
    font-family: var(--font-chrome);
  }
</style>
