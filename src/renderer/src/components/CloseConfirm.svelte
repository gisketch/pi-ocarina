<script lang="ts">
  import { shell } from '$lib/state/shell.svelte'
  import { workspaceOfTerminal } from '$lib/types'

  // Keys are answered by the shell's own modal gate, so this draws the question
  // and nothing else — one place decides what an answer means.
  //
  // What is at stake differs: a thread loses a turn, a shell loses a running
  // process. Saying "turn" over a shell would describe the wrong loss.
  const isShell = $derived(workspaceOfTerminal(shell.pendingClose ?? '') !== null)
  const question = $derived(
    isShell
      ? 'this shell is running something — closing it kills it'
      : 'this thread is running — closing it cancels the turn',
  )
</script>

<div class="confirm" role="alertdialog" aria-label="Close something that is running">
  <span class="warn">▲</span>
  <span class="text">{question}</span>
  <span class="keys">
    <span class="key">y</span> close · <span class="key">esc</span> keep
  </span>
</div>

<style>
  .confirm {
    position: absolute;
    left: 50%;
    /* Clear of the composer rather than across it. The composer grows with its
       text, so this leaves room for the tallest it gets. */
    bottom: calc(var(--statusbar-h) + 160px);
    transform: translateX(-50%);
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    font-size: 11.5px;
    /* Opaque, not one of the raise washes: this sits over the composer, and a
       question you can read the composer through is a question you might
       answer without reading. The warning is mixed into that colour rather
       than drawn around it. */
    background: color-mix(in srgb, var(--warn) 16%, var(--bg-panel));
    white-space: nowrap;
  }

  .warn {
    color: var(--warn);
  }
  .text {
    color: var(--fg-dim);
  }
  .keys {
    color: var(--fg-dimmest);
  }
  .key {
    color: var(--fg-muted);
  }
</style>
