<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import { SHIPPED_KEYS } from '$lib/keymap'
  import { keybinds } from '$lib/state/keybinds.svelte'
  import { wrapIndex } from '$lib/fuzzy'

  const { onclose }: { onclose: () => void } = $props()

  /** Registry order is display order; the groups read top to bottom the way
   *  the app is learnt: strip first, screens, then the deeper modes. */
  const GROUPS = ['navigate', 'screens', 'read', 'diff', 'leader'] as const
  const TITLES: Record<string, string> = {
    navigate: 'NAVIGATE',
    screens: 'SCREENS',
    read: 'READ',
    diff: 'DIFF',
    leader: 'LEADER ␣',
  }

  const rows = GROUPS.flatMap((group) =>
    Object.entries(SHIPPED_KEYS)
      .filter(([, entry]) => entry.group === group)
      .map(([action, entry]) => ({ action, entry, group })),
  )

  let selected = $state(0)
  /** True after one ⇧R; the second within this armed state resets all. */
  let resetAsked = $state(false)

  let list = $state<HTMLElement | null>(null)

  /** vim's scrolloff: the selection never enters the outermost rows of the
   *  viewport. The moment it comes within two rows of an edge, the list
   *  scrolls — so what is coming next is always on screen before it is
   *  chosen. */
  const SCROLLOFF = 2
  $effect(() => {
    const holder = list
    const row = holder?.querySelectorAll<HTMLElement>('.row')[selected]
    if (!holder || !row) return

    const margin = row.offsetHeight * SCROLLOFF
    const top = row.offsetTop - margin
    const bottom = row.offsetTop + row.offsetHeight + margin
    if (top < holder.scrollTop) holder.scrollTop = top
    else if (bottom > holder.scrollTop + holder.clientHeight) {
      holder.scrollTop = bottom - holder.clientHeight
    }
  })

  const row = $derived(rows[selected])
  const recording = $derived(keybinds.recording !== null)

  /** A press, spelt for a chip. */
  function spell(press: string): string {
    if (press === ' ') return '␣'
    if (press === 'Tab') return '⇥'
    if (press.startsWith('C-')) return `^${press.slice(2)}`
    return press
  }

  function sourceOf(action: string): 'config' | 'yours' | null {
    if (keybinds.lockedBy(action)) return 'config'
    if (keybinds.keys[action] !== undefined) return 'yours'
    return null
  }

  function move(delta: number): void {
    selected = wrapIndex(selected + delta, rows.length)
  }

  /** h/l hop a whole group — the list is long, and a reader after the DIFF
   *  keys should not have to walk every NORMAL row to reach them. */
  function hop(delta: number): void {
    const here = rows[selected].group
    if (delta > 0) {
      const next = rows.findIndex((one, i) => i > selected && one.group !== here)
      selected = next === -1 ? 0 : next
      return
    }
    const starts = rows.map((one, i) => (i === 0 || rows[i - 1].group !== one.group ? i : -1))
    const heads = starts.filter((i) => i !== -1)
    const at = heads.filter((i) => i < selected).pop()
    const before = heads.filter((i) => i < (at ?? 0)).pop()
    selected = selected === at || at === undefined ? (before ?? heads[heads.length - 1]) : at
  }

  function record(): void {
    if (keybinds.lockedBy(row.action)) return
    keybinds.recording = row.action
  }

  function onkeydown(event: KeyboardEvent): void {
    // The modal gate already fed this key to the recording — this handler
    // must not also navigate with it. `defaultPrevented` covers the ordering
    // hole: on the very key that ends a recording, the gate has already
    // disarmed by the time this listener runs, and only the shell's
    // preventDefault still says the key was taken.
    if (recording || event.defaultPrevented) return

    if (event.key !== 'R') resetAsked = false
    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        move(1)
        break
      case 'k':
      case 'ArrowUp':
        move(-1)
        break
      case 'l':
      case 'ArrowRight':
        hop(1)
        break
      case 'h':
      case 'ArrowLeft':
        hop(-1)
        break
      case 'Enter':
      case ' ':
        record()
        break
      case 'r':
        void keybinds.reset(row.action)
        break
      case 'R':
        // Twice to mean it: a whole keymap is a lot to lose to one capital.
        if (resetAsked) void keybinds.resetAll()
        resetAsked = !resetAsked
        break
      default:
        return
    }
    event.preventDefault()
  }
</script>

<svelte:window {onkeydown} />

<Backdrop {onclose} z={55} label="Keymaps">
  <div class="keybinds">
    <div class="head">
      KEYMAPS
      <span class="note">{Object.keys(keybinds.keys).length || 'no'} rebound</span>
    </div>

    <div class="rows" bind:this={list}>
      {#each rows as one, i (one.action)}
        {#if i === 0 || rows[i - 1].group !== one.group}
          <div class="group">{TITLES[one.group]}</div>
        {/if}
        <button
          type="button"
          class="row"
          class:selected={i === selected}
          onclick={() => {
            selected = i
            record()
          }}
          onmouseenter={() => (selected = i)}
        >
          {one.entry.label}
          {#if sourceOf(one.action) === 'config'}
            <span class="tag lock">config.json</span>
          {:else if sourceOf(one.action) === 'yours'}
            <span class="tag">yours</span>
          {/if}
          {#if keybinds.unbound(one.action)}
            <span class="tag bad">unbound</span>
          {/if}
          {#if keybinds.recording === one.action}
            <span class="press recording">press a key…</span>
          {:else}
            <span class="press" class:moved={sourceOf(one.action) !== null}>
              {spell(keybinds.pressOf(one.action))}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="foot">
      {#if recording}
        any key binds · esc cancels
      {:else if keybinds.lockedBy(row?.action ?? '')}
        set by hand in config.json — the app will not fight it
      {:else if resetAsked}
        ⇧R again resets every rebind
      {:else}
        j/k move · h/l group · ⏎/␣ record · r reset · ⇧R reset all · esc close
      {/if}
    </div>
  </div>
</Backdrop>

<style>
  .keybinds {
    width: 560px;
    background: var(--bg-panel);
    animation: rise 0.2s ease;
    display: flex;
    flex-direction: column;
    max-height: 78vh;
  }

  .head {
    display: flex;
    align-items: center;
    padding: 14px 20px;
    background: var(--bg-header);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
  }
  .note {
    margin-left: auto;
    letter-spacing: 0.04em;
    color: var(--fg-dimmest);
  }

  .rows {
    padding: 8px 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    /* The offset parent for the scrolloff arithmetic: a row's offsetTop must
       be measured against this box, not the panel behind it. */
    position: relative;
  }

  .group {
    padding: 10px 20px 4px;
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    color: var(--fg-dimmest);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 20px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    color: var(--fg-agent);
    border: none;
    background: none;
    font-family: var(--font-body);
    font-size: 12px;
  }
  .row.selected {
    background: var(--accent-soft);
  }

  .tag {
    font-family: var(--font-chrome);
    font-size: 9px;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    background: var(--bg-chip);
    color: var(--fg-dimmest);
  }
  .tag.lock {
    color: var(--fg-dim);
  }
  .tag.bad {
    color: var(--err-text);
    background: rgba(224, 122, 107, 0.14);
  }

  .press {
    margin-left: auto;
    min-width: 26px;
    text-align: center;
    padding: 2px 7px;
    background: var(--bg-chip);
    font-family: var(--font-chrome);
    font-size: 11px;
    color: var(--fg-bright);
  }
  .press.moved {
    color: var(--accent);
  }
  .press.recording {
    background: oklch(0.76 0.14 var(--accent-hue) / 0.2);
    color: var(--accent);
    animation: pulse 1.1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }

  .foot {
    padding: 10px 20px;
    background: var(--bg-header);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
</style>
