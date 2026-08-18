<script lang="ts">
  /** What the model thought, drawn as margin notes.
   *
   *  Always visible, never loud: a rule down the left and the dimmest text in
   *  the palette. It reads as something written in the margin of the answer,
   *  which is what it is. Collapsed it shows the *latest* line — a glance says
   *  where the model's head is while it is still there — and expanded it shows
   *  the whole thought, plain. No markdown: reasoning styled like an answer
   *  competes with the answer. */
  import Icon from '../Icon.svelte'
  import { reasoningOpen } from '$lib/state/reasoning.svelte'

  interface Props {
    id: string
    text: string
    streaming?: boolean
    ms?: number
    threadId?: string
  }

  const { id, text, streaming = false, ms, threadId = '' }: Props = $props()

  const open = $derived(reasoningOpen.isOpen(threadId, id))

  /** The tail, not the head. What the model is thinking now is the part worth
   *  a line; what it thought first is one expand away. */
  const tail = $derived(text.trim().split('\n').filter(Boolean).at(-1) ?? '')

  const took = $derived(ms === undefined || ms < 100 ? '' : `${(ms / 1000).toFixed(1)}s`)
</script>

<div class="reasoning" class:open>
  <button type="button" class="head" onclick={() => reasoningOpen.toggle(threadId, id)}>
    {#if streaming}
      <span class="mark"></span>
    {:else}
      <span class="chev"><Icon name={open ? 'chevron-down' : 'chevron-right'} /></span>
    {/if}
    <span class="word">REASONING</span>
    {#if streaming}
      <span class="took">streaming…</span>
    {:else if took}
      <span class="took">{took}</span>
    {/if}
    <span class="key">o</span>
  </button>

  {#if open}
    <p class="full">{text}</p>
  {:else if tail}
    <p class="tail">{tail}</p>
  {/if}
</div>

<style>
  .reasoning {
    border-left: 2px solid var(--line-mid);
    padding: 2px 0 2px 12px;
    margin: 4px 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dimmest);
    text-align: left;
  }
  .word {
    color: var(--fg-dimmer);
  }
  .chev {
    color: var(--fg-dimmer);
    width: 7px;
  }
  /* A square that breathes rather than a spinner: the transcript's other live
     marks are squares, and one vocabulary is easier to read than two. */
  .mark {
    width: 6px;
    height: 6px;
    background: var(--fg-dimmer);
    animation: blinkpx 0.9s steps(2) infinite;
  }
  @keyframes blinkpx {
    0%,
    100% {
      opacity: 0.12;
    }
    50% {
      opacity: 0.45;
    }
  }
  .key {
    margin-left: auto;
    border: 1px solid var(--line-mid);
    padding: 0 4px;
    font-size: 9.5px;
  }

  p {
    margin: 6px 0 0;
    font-size: 11.5px;
    line-height: 1.7;
    color: var(--fg-dimmest);
    white-space: pre-wrap;
  }
  /* One line, ellipsized: a collapsed block has a fixed height, which is what
     keeps the transcript's estimates honest while a thread streams. */
  .tail {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .full {
    color: var(--fg-dimmer);
  }
</style>
