<script lang="ts" generics="T">
  import type { Snippet } from 'svelte'
  import TelescopeShell from './TelescopeShell.svelte'
  import { fuzzyNarrower } from '$lib/fuzzy'

  interface Props {
    onclose: () => void
    label: string
    placeholder: string
    items: readonly T[]
    /** What the filter matches against. */
    text: (item: T) => string
    /** A stable key per row, for the list's identity. */
    key: (item: T) => string
    onpick: (item: T) => void
    /** The left pane's one-line row. */
    row: Snippet<[T]>
    /** The right pane, drawn for the highlighted item — or for nothing, when
     *  the filter has emptied the list. */
    preview: Snippet<[T | undefined]>
    /** What an empty list says. The file search borrows it for its first
     *  index walk, which is a wait rather than a miss. */
    empty?: string
  }

  const {
    onclose,
    label,
    placeholder,
    items,
    text,
    key,
    onpick,
    row,
    preview,
    empty = 'nothing matches',
  }: Props = $props()

  let query = $state('')
  let picked = $state(0)
  let input = $state<HTMLInputElement | null>(null)
  let list = $state<HTMLElement | null>(null)
  /** The rows, registered as they mount. A plain array on purpose: the
   *  scrolloff effect below already re-runs per keystroke on `hits`, and it
   *  runs after the list has rendered — walking the DOM for elements the
   *  render just created was the only reason `querySelectorAll` was here. */
  let entries: (HTMLElement | null)[] = []

  /** Only the head of the match is shown (spec D8): past this the reader
   *  types, never scrolls. The narrower still matched everything, so the next
   *  character narrows the full set. */
  const CAP = 50

  const narrow = fuzzyNarrower((item: T) => text(item))
  const hits = $derived(narrow(items, query).slice(0, CAP))
  const highlighted = $derived(hits[Math.min(picked, Math.max(0, hits.length - 1))])

  // The input keeps the caret for the picker's whole life — moving the
  // highlight is a chord, not a focus change. Telescope's contract.
  $effect(() => {
    input?.focus()
  })

  /** vim's scrolloff, the same contract the keymaps screen keeps: the
   *  highlight never enters the outermost rows of the list. The moment it
   *  comes within two rows of an edge, the list scrolls — what is coming
   *  next is on screen before it is chosen. */
  const SCROLLOFF = 2
  $effect(() => {
    const at = hits.indexOf(highlighted as T)
    const holder = list
    const entry = entries[at]
    if (!holder || !entry) return

    const margin = entry.offsetHeight * SCROLLOFF
    const top = entry.offsetTop - margin
    const bottom = entry.offsetTop + entry.offsetHeight + margin
    if (top < holder.scrollTop) holder.scrollTop = top
    else if (bottom > holder.scrollTop + holder.clientHeight) {
      holder.scrollTop = bottom - holder.clientHeight
    }
  })

  function move(delta: number): void {
    if (hits.length === 0) return
    picked = Math.max(0, Math.min(hits.length - 1, Math.min(picked, hits.length - 1) + delta))
  }

  function onkeydown(event: KeyboardEvent): void {
    // ctrl and cmd both: ctrl-j/k is the terminal's habit, cmd-j/k the
    // mac's hand — and neither letter is anything the filter could want.
    const chord = (event.ctrlKey || event.metaKey) && !event.altKey
    if (event.key === 'ArrowDown' || (chord && event.key === 'j') || (chord && event.key === 'n')) {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === 'ArrowUp' || (chord && event.key === 'k') || (chord && event.key === 'p')) {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (highlighted !== undefined) onpick(highlighted)
    }
  }
</script>

<TelescopeShell {onclose} {label}>
  {#snippet left()}
    <input
      bind:this={input}
      bind:value={query}
      {placeholder}
      spellcheck="false"
      oninput={() => (picked = 0)}
      onkeydown={onkeydown}
    />
    <div class="list" bind:this={list}>
      {#each hits as hit, index (key(hit))}
        <button
          bind:this={entries[index]}
          type="button"
          class="entry"
          class:on={hit === highlighted}
          onclick={() => onpick(hit)}
          onmouseenter={() => (picked = index)}
        >
          {@render row(hit)}
        </button>
      {:else}
        <div class="none">{empty}</div>
      {/each}
    </div>
  {/snippet}
  {#snippet right()}
    {@render preview(highlighted)}
  {/snippet}
</TelescopeShell>

<style>
  input {
    background: rgba(255, 255, 255, 0.05);
    padding: 10px 12px;
    font-family: var(--font-body);
    font-size: 12.5px;
    color: var(--fg-bright);
    outline: none;
  }
  input::placeholder {
    color: var(--fg-dimmest);
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
    /* The offset parent for the scrolloff arithmetic: an entry's offsetTop
       must be measured against this box, not the shell panel behind it —
       the same contract the keymaps screen keeps. */
    position: relative;
  }
  .entry {
    display: block;
    width: 100%;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--fg-dim);
    text-align: left;
    cursor: pointer;
    background: none;
  }
  /* Full-bleed, visual-line style: the picked row is a band. */
  .entry.on {
    background: var(--seg-strong);
    color: var(--fg-bright);
  }
  .none {
    padding: 10px 12px;
    font-size: 11.5px;
    color: var(--fg-dimmest);
  }
</style>
