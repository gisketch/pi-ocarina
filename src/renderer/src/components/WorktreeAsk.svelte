<script lang="ts">
  import { worktreeAsk } from '$lib/state/worktree-ask.svelte'

  // Keys are answered by the shell's modal gate, so this draws the question
  // and nothing else — one place decides what an answer means.
  const naming = $derived(worktreeAsk.naming)
  const problem = $derived(worktreeAsk.problem)
</script>

{#if worktreeAsk.open}
  <div class="scrim">
    <div class="modal" role="dialog" aria-label="new worktree">
      <div class="header">⑂ NEW THREAD</div>

      {#if !naming}
        <div class="message">Run this thread in a new worktree?</div>
        <div class="detail">
          Its own checkout and its own branch, so its edits stay out of the
          folder everything else is working in.
        </div>
        <div class="actions">
          <button type="button" class="cancel" onclick={() => worktreeAsk.no()}>
            no <span class="key">⏎</span>
          </button>
          <button type="button" class="go" onclick={() => worktreeAsk.yes()}>
            worktree <span class="key">y</span>
          </button>
        </div>
      {:else}
        <div class="message">Branch name</div>
        <div class="field" class:bad={problem !== null}>
          <span class="typed">{worktreeAsk.branch}</span><span class="caret"></span>
        </div>
        <div class="detail" class:bad={problem !== null}>
          {problem ?? 'e.g. fix/OCA-231 · esc goes back'}
        </div>
        <div class="actions">
          <button type="button" class="cancel" onclick={() => (worktreeAsk.naming = false)}>
            back <span class="key">esc</span>
          </button>
          <button
            type="button"
            class="go"
            disabled={!worktreeAsk.ready}
            onclick={() => worktreeAsk.take()}
          >
            create <span class="key">⏎</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
  }

  .modal {
    width: 420px;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid var(--line-strong);
    background: var(--bg-panel);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .header {
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.12em;
    /* The workspace accent, not the destructive red: nothing here is lost by
       answering, and a red question would teach the reader to fear a key they
       will press every day. */
    color: var(--accent);
  }

  .message {
    font-size: 12px;
    color: var(--fg-body);
  }

  .detail {
    font-size: 11px;
    color: var(--fg-dimmer);
  }
  .detail.bad {
    color: var(--err-text);
  }

  .field {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 7px 10px;
    border: 1px solid var(--line-strong);
    background: var(--bg-inset, rgba(255, 255, 255, 0.03));
    font-family: var(--font-body);
    font-size: 12.5px;
    color: var(--fg-bright);
    min-height: 32px;
  }
  .field.bad {
    border-color: var(--err);
  }
  .caret {
    width: 6px;
    height: 14px;
    background: var(--accent);
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  button {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    padding: 6px 12px;
    border: 1px solid var(--line-strong);
    background: transparent;
    font-family: inherit;
    font-size: 11.5px;
    color: var(--fg-body);
    cursor: pointer;
  }
  button:disabled {
    color: var(--fg-ghost);
    cursor: default;
  }
  .go {
    color: var(--fg-bright);
    border-color: var(--accent-soft);
  }
  .key {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    color: var(--fg-dimmest);
  }
</style>
