<script lang="ts">
  import { confirm } from '$lib/state/confirm.svelte'

  // Keys are answered by the shell's modal gate, so this draws the question
  // and nothing else — one place decides what an answer means.
  const request = $derived(confirm.request)
</script>

{#if request}
  <div class="scrim">
    <div class="modal" role="alertdialog" aria-label={request.title}>
      <div class="header">! {request.title}</div>
      <div class="message">{request.message}</div>
      <div class="actions">
        <button type="button" class="go" onclick={() => confirm.answer(true)}>
          {request.confirmLabel} <span class="key">⏎</span>
        </button>
        <button type="button" class="cancel" onclick={() => confirm.answer(false)}>
          cancel <span class="key">esc</span>
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
    border: 1px solid var(--line-strong);
    background: var(--bg-panel);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .header {
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    /* Red, not the workspace accent: this is the one surface that must read
       the same in every workspace, because the answer cannot be taken back. */
    color: var(--err);
  }

  .message {
    font-size: 12px;
    color: var(--fg-body);
    line-height: 1.6;
  }

  .actions {
    display: flex;
    gap: 8px;
    font-family: var(--font-chrome);
    font-size: 10.5px;
  }

  .go,
  .cancel {
    padding: 5px 14px;
    cursor: pointer;
    font: inherit;
  }
  .go {
    border: none;
    background: var(--err);
    color: var(--bg-deep);
  }
  .cancel {
    border: 1px solid var(--line-strong);
    background: none;
    color: var(--fg-dim);
  }

  .key {
    opacity: 0.6;
  }
</style>
