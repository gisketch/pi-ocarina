<script lang="ts">
  import { shell } from '$lib/state/shell.svelte'

  // Keys are answered by the shell's own modal gate, so this draws the question
  // and nothing else — one place decides what an answer means.
</script>

<div class="confirm" role="alertdialog" aria-label="Close a running thread">
  <span class="warn">▲</span>
  <span class="text">this thread is running — closing it cancels the turn</span>
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
    border: 1px solid var(--warn);
    /* Opaque, not one of the raise washes: this sits over the composer, and a
       question you can read the composer through is a question you might
       answer without reading. */
    background: var(--bg-panel);
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
