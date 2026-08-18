<script lang="ts">
  import Spotlight from './Spotlight.svelte'
  import type { ModelSummary } from '../../../../shared/protocol'
  import type { ReasoningLevel } from '$lib/thread'
  import { costTier, ctxLabel, reasoningBars } from '$lib/models'
  import { fuzzyFilter } from '$lib/fuzzy'
  import { models } from '$lib/state/models.svelte'

  interface Props {
    onclose: () => void
    onpick: (model: ModelSummary, reasoning: ReasoningLevel | null) => void
    current?: { provider: string; id: string }
    /** Choosing for every new thread rather than for the open one. */
    forDefault?: boolean
    /** Which thread it is about to change, so the reader is never guessing. */
    threadLabel?: string
  }

  const { onclose, onpick, current, forDefault = false, threadLabel }: Props = $props()

  /** Says whose model this is. A picker that named nothing was answerable only
   *  by remembering which column had focus. */
  const scope = $derived(
    forDefault ? 'NEW THREADS' : threadLabel ? `THREAD ${threadLabel}` : 'MODEL',
  )

  let query = $state('')
  let chosen = $state<ModelSummary | null>(null)

  const step = $derived(chosen === null ? 'model' : 'reasoning')
  const rows = $derived(
    fuzzyFilter(models.all, query, (model) => `${model.name} ${model.id} ${model.provider}`),
  )
  const tiles = $derived(chosen?.reasoning ?? [])

  function pickModel(model: ModelSummary): void {
    // A model that cannot reason has nothing to ask about, so the second step
    // is skipped rather than shown empty.
    if (model.reasoning.length === 0) {
      onpick(model, null)
      return
    }
    chosen = model
    query = ''
  }

  function pickReasoning(level: ReasoningLevel): void {
    if (chosen) onpick(chosen, level)
  }

  function onkeydown(event: KeyboardEvent): void {
    const list: unknown[] = step === 'model' ? rows : tiles

    // Number keys address the list as drawn, which is what the chips show.
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= list.length) {
      event.preventDefault()
      if (step === 'model') pickModel(rows[digit - 1])
      else pickReasoning(tiles[digit - 1])
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (step === 'model' && rows.length > 0) pickModel(rows[0])
      else if (step === 'reasoning' && tiles.length > 0) pickReasoning(tiles[0])
      return
    }

    // Escape steps back to the model list rather than closing outright — the
    // second step is a continuation, not a separate dialog.
    if (event.key === 'Escape' && step === 'reasoning') {
      event.preventDefault()
      event.stopPropagation()
      chosen = null
      query = ''
    }
  }
</script>

<Spotlight
  {onclose}
  z={52}
  label="Model selector"
  prefix={step === 'model' ? scope : 'REASONING'}
  placeholder={step === 'model' ? 'select model…' : 'select reasoning…'}
  bind:value={query}
  {onkeydown}
>
  <div class="panel">
    {#if step === 'model'}
      <div class="rows">
        {#each rows as model, i (`${model.provider}/${model.id}`)}
          <button
            type="button"
            class="row"
            class:current={model.provider === current?.provider && model.id === current?.id}
            onclick={() => pickModel(model)}
          >
            <span class="bars">
              {#each reasoningBars(model.reasoning.length) as bar, b (b)}
                <span class="bar" class:lit={bar} style:height="{3.5 * (b + 1)}px"></span>
              {/each}
            </span>
            <span class="name">{model.name}</span>
            <span class="provider">{model.provider}</span>
            <span class="meta">{ctxLabel(model.contextWindow)} · {costTier(model.costPerMTok)}</span>
            {#if i < 9}<span class="chip">{i + 1}</span>{/if}
          </button>
        {:else}
          <div class="empty">
            pi has no models configured — set one up in pi's own config first
          </div>
        {/each}
      </div>
      <div class="foot">1–9 or ⏎ pick model · then reasoning · esc cancel</div>
    {:else}
      <div class="tiles">
        {#each tiles as level, i (level)}
          <button type="button" class="tile" onclick={() => pickReasoning(level)}>
            <span class="bars tall">
              {#each reasoningBars(tiles.length, i + 1) as bar, b (b)}
                <span class="bar" class:lit={bar} style:height="{5 * (b + 1)}px"></span>
              {/each}
            </span>
            <span class="level">{level}</span>
            {#if i < 9}<span class="chip">{i + 1}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="foot">1–{tiles.length} or ⏎ pick reasoning for {chosen?.name} · esc back</div>
    {/if}
  </div>
</Spotlight>

<style>
  .panel {
    width: 560px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    animation: rise 0.2s ease;
  }

  .rows {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 320px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #2c2c33 transparent;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 11px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    border: none;
    border-left: 2px solid transparent;
    background: none;
    font-family: var(--font-body);
    transition: background-color 0.12s;
  }
  .row:hover {
    background: var(--bg-hover-2);
  }
  .row.current {
    border-left-color: var(--accent);
    background: var(--accent-soft);
  }

  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
    flex: none;
  }
  .bars.tall {
    height: 20px;
  }
  .bar {
    width: 4px;
    background: rgba(255, 255, 255, 0.1);
  }
  .bars.tall .bar {
    width: 5px;
  }
  .bar.lit {
    background: var(--accent);
  }

  .name {
    color: var(--fg-bright);
    font-size: 12.5px;
    flex: none;
    max-width: 190px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .provider {
    color: var(--fg-dim);
    font-size: 11px;
  }
  .meta {
    margin-left: auto;
    color: var(--fg-dimmest);
    font-size: 10px;
    white-space: nowrap;
  }
  .chip {
    font-size: 9.5px;
    color: var(--fg-dim);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 1px 6px;
    flex: none;
  }

  .tiles {
    padding: 14px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .tile {
    flex: 1 1 90px;
    padding: 16px 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    cursor: pointer;
    font-family: var(--font-body);
    transition: transform 0.12s, border-color 0.12s;
  }
  .tile:hover {
    transform: translateY(-2px);
    border-color: oklch(0.76 0.14 var(--accent-hue) / 0.5);
  }
  .level {
    font-size: 10.5px;
    color: var(--fg-dim);
  }

  .foot {
    display: flex;
    gap: 14px;
    padding: 9px 16px;
    border-top: 1px solid var(--bg-chip);
    font-size: 10px;
    color: var(--fg-dimmest);
    font-family: var(--font-chrome);
  }

  .empty {
    padding: 14px 11px;
    color: var(--fg-dimmest);
    font-size: 11.5px;
    font-family: var(--font-body);
  }
</style>
