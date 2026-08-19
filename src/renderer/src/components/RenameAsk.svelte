<script lang="ts">
  import { renameAsk } from '$lib/state/rename-ask.svelte'
  import Icon from './Icon.svelte'

  // Keys are answered by the shell's modal gate, so this draws the field
  // and nothing else — one place decides what an answer means.
  const failure = $derived(renameAsk.failure)
</script>

{#if renameAsk.open}
  <div class="scrim">
    <div class="modal" role="dialog" aria-label="rename thread">
      <div class="header"><Icon name="tool-edit" /> RENAME THREAD</div>

      <div class="field" class:bad={failure !== null}>
        <span class="typed" class:selected={renameAsk.pristine}>{renameAsk.title}</span><span
          class="caret"
        ></span>
      </div>
      <div class="detail" class:bad={failure !== null}>
        {#if renameAsk.pending}
          renaming…
        {:else if renameAsk.pristine}
          {failure ?? 'type to replace · esc cancels'}
        {:else}
          {failure ?? 'one line, worth reading in a header · esc cancels'}
        {/if}
      </div>
      <div class="actions">
        <button
          type="button"
          class="cancel"
          disabled={renameAsk.pending}
          onclick={() => renameAsk.cancel()}
        >
          cancel <span class="key">esc</span>
        </button>
        <button type="button" class="go" disabled={!renameAsk.ready} onclick={() => renameAsk.take()}>
          rename <span class="key">⏎</span>
        </button>
      </div>
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
    background: var(--bg-panel);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--accent);
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
    padding: 8px 11px;
    background: rgba(255, 255, 255, 0.05);
    font-family: var(--font-body);
    font-size: 12.5px;
    color: var(--fg-bright);
    min-height: 32px;
  }
  .field.bad {
    background: rgba(224, 122, 107, 0.12);
  }
  .typed {
    white-space: pre;
    overflow: hidden;
  }
  /* The prefill stands selected, the way a file rename opens: the first
     character replaces the lot. */
  .typed.selected {
    background: oklch(0.76 0.14 var(--accent-hue) / 0.28);
  }
  .caret {
    width: 6px;
    height: 14px;
    flex: none;
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
    padding: 7px 13px;
    border: none;
    background: rgba(255, 255, 255, 0.06);
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
    background: oklch(0.76 0.14 var(--accent-hue) / 0.15);
  }
  .key {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    color: var(--fg-dimmest);
  }
</style>
