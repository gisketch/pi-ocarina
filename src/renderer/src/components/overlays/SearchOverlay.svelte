<script lang="ts">
  import { onDestroy } from 'svelte'
  import Spotlight from './Spotlight.svelte'
  import type { SearchHit } from '../../../../shared/protocol'
  import { session } from '$lib/session'

  interface Props {
    onclose: () => void
    onjump: (hit: SearchHit) => void
  }

  const { onclose, onjump }: Props = $props()

  let query = $state('')
  let hits = $state.raw<SearchHit[]>([])
  let complete = $state(true)
  let picked = $state(0)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  /** Each search walks every workspace and reads session files, so one per
   *  keystroke would have "backoff" launch seven overlapping scans. Waiting for
   *  a pause in typing costs nothing a person notices and does the work once. */
  const DEBOUNCE_MS = 140

  function schedule(): void {
    picked = 0
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void search()
    }, DEBOUNCE_MS)
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer)
  })

  async function search(): Promise<void> {
    const mine = ++generation
    const text = query

    if (text.trim() === '') {
      hits = []
      complete = true
      return
    }

    try {
      const result = await session.invoke('searchThreads', { query: text })
      // A slower earlier search must not overwrite a newer one's results.
      if (mine !== generation) return
      hits = result.hits
      complete = result.complete
    } catch {
      if (mine !== generation) return
      hits = []
      complete = true
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    if (hits.length === 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        picked = Math.min(hits.length - 1, picked + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        picked = Math.max(0, picked - 1)
        break
      case 'Enter':
        event.preventDefault()
        onjump(hits[picked])
        break
    }
  }

  /** Splits a snippet around the match so it can be highlighted. */
  function parts(text: string): { text: string; hit: boolean }[] {
    const at = text.toLowerCase().indexOf(query.trim().toLowerCase())
    if (at === -1 || query.trim() === '') return [{ text, hit: false }]

    const end = at + query.trim().length
    return [
      { text: text.slice(0, at), hit: false },
      { text: text.slice(at, end), hit: true },
      { text: text.slice(end), hit: false },
    ].filter((part) => part.text !== '')
  }

  function when(modified: string): string {
    const at = new Date(modified)
    if (Number.isNaN(at.getTime())) return ''

    const days = Math.floor((Date.now() - at.getTime()) / 86_400_000)
    if (days <= 0) return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (days === 1) return 'yesterday'
    return `${days}d ago`
  }
</script>

<Spotlight
  {onclose}
  z={58}
  label="Search threads"
  placeholder="search every thread…"
  bind:value={query}
  {onkeydown}
  oninput={schedule}
>
  {#if hits.length > 0}
    <div class="results">
      {#each hits as hit, i (hit.threadId)}
        <button
          type="button"
          class="hit"
          class:active={i === picked}
          onclick={() => onjump(hit)}
          onmouseenter={() => (picked = i)}
        >
          <span class="head">
            <span class="title">{hit.title}</span>
            <span class="workspace">{hit.workspaceName}</span>
            <span class="when">{when(hit.modified)}</span>
          </span>
          <span class="snippet">
            {#each parts(hit.snippet) as part, p (p)}<span class:hit={part.hit}>{part.text}</span
              >{/each}
          </span>
        </button>
      {/each}

      {#if !complete}
        <div class="capped">
          showing what was found before the time budget ran out — narrow the search for more
        </div>
      {/if}
    </div>
  {:else if query.trim() !== ''}
    <div class="results"><div class="capped">no thread matches that</div></div>
  {/if}
</Spotlight>

<style>
  .results {
    width: 560px;
    max-height: 380px;
    overflow-y: auto;
    background: var(--bg-panel);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    padding: 6px 0;
    display: flex;
    flex-direction: column;
    animation: rise 0.2s ease;
    scrollbar-width: thin;
    scrollbar-color: #2c2c33 transparent;
  }

  .hit {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 17px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    border: none;
    background: rgba(255, 255, 255, 0.03);
    font-family: var(--font-body);
  }
  .hit.active {
    background: var(--accent-soft);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 9px;
    font-size: 12px;
  }
  .title {
    color: var(--fg-bright);
  }
  .workspace {
    color: var(--fg-dim);
    font-size: 10.5px;
  }
  .when {
    margin-left: auto;
    color: var(--fg-dimmest);
    font-size: 10px;
    font-family: var(--font-chrome);
  }

  .snippet {
    color: var(--fg-dimmer);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .snippet :global(.hit) {
    color: var(--accent);
  }

  .capped {
    padding: 9px 17px;
    color: var(--fg-dimmest);
    font-size: 10.5px;
    font-family: var(--font-chrome);
  }
</style>
