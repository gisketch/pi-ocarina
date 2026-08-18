<script lang="ts" generics="T">
  /** The box both completion menus are drawn in.
   *
   *  One component because the two had drifted: the file picker capped its
   *  list at eight and the command menu drew every entry it had, so a machine
   *  with forty skills got a menu taller than the window. This holds a fixed
   *  number of rows and scrolls the rest, and keeps the highlighted row in
   *  view as the reader walks it — which a list that simply grew never had to
   *  do.
   *
   *  Each row is one line by construction: a grid whose middle column is the
   *  only one allowed to take the slack, so the columns either side of it stay
   *  where they are on every row. */
  import type { Snippet } from 'svelte'

  interface Props {
    label: string
    items: T[]
    active: number
    key: (item: T) => string
    onpick: (item: T) => void
    onhover: (index: number) => void
    row: Snippet<[T, boolean]>
  }

  const { label, items, active, key, onpick, onhover, row }: Props = $props()

  let box = $state<HTMLElement | null>(null)

  /** Keeps the highlight on screen. `nearest` rather than `center`: walking a
   *  list with the arrow keys should feel like a cursor moving down a page,
   *  not like the page jumping under it. */
  $effect(() => {
    void active
    const chosen = box?.children[active]
    chosen?.scrollIntoView({ block: 'nearest' })
  })
</script>

<div class="menu" bind:this={box} role="listbox" aria-label={label}>
  {#each items as item, i (key(item))}
    <button
      type="button"
      class="row"
      class:active={i === active}
      role="option"
      aria-selected={i === active}
      onmousedown={(event) => {
        // mousedown, not click: clicking blurs the composer first, and a blur
        // that closes the menu would cancel the pick before it happened.
        event.preventDefault()
        onpick(item)
      }}
      onmouseenter={() => onhover(i)}
    >
      {@render row(item, i === active)}
    </button>
  {/each}
</div>

<style>
  .menu {
    background: var(--bg-panel);
    animation: rise 0.15s ease;
    /* Eight rows, then scroll. Enough to choose from without the menu
       becoming the window. */
    max-height: calc(8 * 28px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .row {
    display: grid;
    grid-template-columns: 13px max-content minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    height: 28px;
    padding: 0 12px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--fg-agent);
    font-family: var(--font-body);
    font-size: 11.5px;
  }
  .row.active {
    background: var(--bg-hover-2);
  }
</style>
