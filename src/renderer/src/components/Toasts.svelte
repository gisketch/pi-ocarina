<script lang="ts">
  import { toasts, type Toast, type ToastJump } from '$lib/state/toasts.svelte'
  import Icon from './Icon.svelte'

  // The jump belongs to whoever already knows how to put a thread on screen;
  // a toast only says which thread it means.
  const { onview }: { onview: (jump: ToastJump) => void } = $props()

  const MARK = { ok: 'check', info: 'info', ask: 'warning', error: 'error' } as const

  function act(toast: Toast): void {
    if (toast.jump) onview(toast.jump)
    else toast.run?.()
    toasts.dismiss(toast.id)
  }
</script>

<div class="stack" role="status" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div class="toast {toast.tone}">
      <span class="mark"><Icon name={MARK[toast.tone]} /></span>
      <span class="text">{toast.text}</span>
      {#if toast.label}
        <button type="button" class="action" onclick={() => act(toast)}>{toast.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* A question, in the accent rather than the error red: it is a request, not
     a failure, and it keeps the long lifetime for reading rather than alarm. */
  .toast.ask {
    border-color: var(--accent-soft);
  }

  .stack {
    position: absolute;
    right: 18px;
    /* Above the status bar rather than over it: the bar is chrome the user
       reads while work is running, and covering it to report that work would
       hide the thing they were watching. */
    bottom: calc(var(--statusbar-h) + 14px);
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 380px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    font-size: 11.5px;
    color: var(--fg-body);
    background: var(--bg-panel);
    border: 1px solid var(--line);
    /* steps(), not a fade: the whole surface animates in pixel jumps, and a
       toast that slid in smoothly would be the one thing here that does not. */
    animation: toast-in 0.16s steps(4);
  }
  .toast.ok {
    border-color: rgba(127, 215, 164, 0.3);
  }
  .toast.error {
    border-color: rgba(224, 122, 107, 0.35);
  }

  .mark {
    flex: none;
  }
  .ok .mark {
    color: var(--ok);
  }
  .info .mark {
    color: var(--accent);
  }
  .error .mark {
    color: var(--err);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action {
    margin-left: auto;
    flex: none;
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dimmest);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .action:hover {
    color: var(--fg-bright);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(14px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
