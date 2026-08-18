<script lang="ts">
  /** Which voice the agent writes in.
   *
   *  A picker rather than a cycle, unlike the permission level next to it. A
   *  level has four fixed values a reader learns the order of; modes are a list
   *  the reader writes, and cycling through nine of them means nine presses and
   *  nine glances at the status bar. A list also shows what each one does. */
  import Spotlight from './Spotlight.svelte'
  import { fuzzyFilter } from '$lib/fuzzy'
  import { app } from '$lib/state/app.svelte'
  import { modes } from '$lib/state/modes.svelte'

  interface Props {
    onclose: () => void
    /** Which thread it is about to change, so the reader is never guessing. */
    threadLabel?: string
  }

  const { onclose, threadLabel }: Props = $props()

  let query = $state('')

  // Read when the picker opens: the voice can change from the palette, from the
  // settings screen, or in another column, and a stale list would offer a mode
  // the reader deleted.
  $effect(() => {
    void modes.load(app.threadId)
  })

  /** "Normal" is the absence of a mode, so it is a row rather than an entry in
   *  the list. It is not the same as inheriting: `''` says this thread has no
   *  voice even when the default has one, and `undefined` hands the thread back
   *  to the default. A single row meaning both would leave a reader who wanted
   *  silence with whatever the default said. */
  const rows = $derived(fuzzyFilter(modes.all, query, (mode) => `${mode.name} ${mode.instructions}`))

  function pick(modeId: string | undefined): void {
    void modes.setThread(modeId)
    onclose()
  }

  function onkeydown(event: KeyboardEvent): void {
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= rows.length) {
      event.preventDefault()
      pick(rows[digit - 1].id)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (rows.length > 0) pick(rows[0].id)
    }
  }
</script>

<Spotlight
  {onclose}
  z={52}
  label="Chat mode"
  prefix={threadLabel ? `THREAD ${threadLabel}` : 'VOICE'}
  placeholder="select a voice…"
  bind:value={query}
  {onkeydown}
>
  <div class="panel">
    <div class="rows">
      <button type="button" class="row" class:current={modes.current === undefined} onclick={() => pick('')}>
        <span class="name">normal</span>
        <span class="what">pi writes as it ships — nothing is added to its instructions</span>
      </button>

      {#if modes.overridden}
        <button type="button" class="row" onclick={() => pick(undefined)}>
          <span class="name">use the default</span>
          <span class="what">this thread stops choosing for itself</span>
        </button>
      {/if}

      {#each rows as mode, i (mode.id)}
        <button
          type="button"
          class="row"
          class:current={modes.current === mode.id}
          onclick={() => pick(mode.id)}
        >
          <span class="name">{mode.name}</span>
          <span class="what">{mode.instructions}</span>
          {#if i < 9}<span class="chip">{i + 1}</span>{/if}
        </button>
      {:else}
        <div class="empty">no voices yet — write one in settings</div>
      {/each}
    </div>
    <div class="foot">1–9 or ⏎ pick · esc cancel</div>
  </div>
</Spotlight>

<style>
  .panel {
    width: 560px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
  }

  .rows {
    max-height: 320px;
    overflow: auto;
  }

  .row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    width: 100%;
    padding: 8px 14px;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--bg-chip);
  }

  .row.current .name {
    color: var(--accent);
  }

  .name {
    min-width: 92px;
    color: var(--fg);
  }

  .what {
    flex: 1;
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip {
    font-size: 10px;
    color: var(--dim);
  }

  .empty,
  .foot {
    padding: 10px 14px;
    font-size: 11px;
    color: var(--dim);
  }

  .foot {
    border-top: 1px solid var(--bg-chip);
  }
</style>
