<script lang="ts">
  import type { Snippet } from 'svelte'
  import { app } from '$lib/state/app.svelte'
  import { registerColumnBody } from '$lib/state/columns'
  import LeapOverlay from '../thread/LeapOverlay.svelte'
  import type { Thread } from '$lib/types'

  interface Props {
    thread: Thread
    focused: boolean
    onfocus: () => void
    children?: Snippet
  }

  const { thread, focused, onfocus, children }: Props = $props()

  // The live model outranks the catalog's listing once the thread has spoken.
  const status = $derived(app.statusOf(thread))

  // Per the reference's thread-state dots: running pulses in the accent, failed is
  // red, a thread waiting on a person is amber (the gate colour), the focused
  // column stays accent, and everything else recedes to grey.
  const tone = $derived(
    status === 'failed'
      ? 'failed'
      : status === 'waiting-input'
        ? 'waiting'
        : status === 'running'
          ? 'running'
          : focused
            ? 'focused'
            : 'idle',
  )

  let body = $state<HTMLElement | null>(null)

  $effect(() => {
    if (!body) return
    return registerColumnBody(thread.id, body)
  })
</script>

<section
  class="column"
  class:focused
  aria-label={app.titleOf(thread)}
  onclickcapture={onfocus}
  role="presentation"
>
  <header class="head">
    <span class="dot {tone}"></span>
    <span class="title">{app.titleOf(thread)}</span>
    <span class="meta">{thread.meta}</span>
  </header>

  <div class="body" bind:this={body}>
    {@render children?.()}
    <LeapOverlay threadId={thread.id} />
  </div>
</section>

<style>
  .column {
    width: var(--column-w);
    flex: none;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.04);
    background: var(--bg-raise);
    opacity: 0.4;
    transition:
      opacity 0.4s,
      border-color 0.4s;
    overflow: hidden;
    cursor: pointer;
  }
  .column.focused {
    opacity: 1;
    border-color: var(--bg-chip);
    cursor: default;
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line-faint);
    font-size: 11px;
  }

  .dot {
    width: 6px;
    height: 6px;
    flex: none;
    background: var(--accent);
  }
  .dot.running {
    animation: pulse 1.1s ease-in-out infinite;
  }
  .dot.idle {
    background: var(--fg-dimmest);
  }
  .dot.failed {
    background: var(--err);
  }
  .dot.waiting {
    background: var(--warn);
    animation: pulse 1.1s ease-in-out infinite;
  }

  .title {
    color: var(--fg-bright);
  }

  .meta {
    margin-left: auto;
    color: var(--fg-dimmest);
  }

  .body {
    flex: 1;
    /* The leap overlay is positioned in this box's content coordinates. */
    position: relative;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    scrollbar-width: thin;
    scrollbar-color: #2c2c33 transparent;
    font-family: var(--font-body);
    font-size: 12.5px;
  }

  /* Scrollback virtualization.
     Every block is skipped by layout and paint while it is off-screen, which is
     what keeps a five-thousand-block thread scrolling. This is done with
     `content-visibility` rather than by windowing the list in JavaScript,
     deliberately: the blocks stay in the DOM, so expand/collapse state, scroll
     anchoring, text selection and find-in-page all keep working — a hand-rolled
     window silently breaks each of those. `contain-intrinsic-size` gives the
     scrollbar a stable estimate so it does not jump as blocks are measured. */
  .body > :global(*) {
    content-visibility: auto;
    contain-intrinsic-size: auto 120px;
  }

  /* The last block is exempt: it is the one that streams, and skipping its
     layout while tokens arrive would make the caret stutter. */
  .body > :global(*:last-child) {
    content-visibility: visible;
  }
</style>
