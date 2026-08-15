<script lang="ts">
  import type { Snippet } from 'svelte'
  import { registerColumnBody } from '$lib/state/columns'
  import type { Thread } from '$lib/types'

  interface Props {
    thread: Thread
    focused: boolean
    onfocus: () => void
    children?: Snippet
  }

  const { thread, focused, onfocus, children }: Props = $props()

  // Per the reference's thread-state dots: running pulses in the accent, failed is
  // red, the focused column stays accent, and everything else recedes to grey.
  const tone = $derived(
    thread.status === 'failed'
      ? 'failed'
      : thread.status === 'running'
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
  aria-label={thread.title}
  onclickcapture={onfocus}
  role="presentation"
>
  <header class="head">
    <span class="dot {tone}"></span>
    <span class="title">{thread.title}</span>
    <span class="meta">{thread.meta}</span>
  </header>

  <div class="body" bind:this={body}>
    {@render children?.()}
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

  .title {
    color: var(--fg-bright);
  }

  .meta {
    margin-left: auto;
    color: var(--fg-dimmest);
  }

  .body {
    flex: 1;
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
</style>
