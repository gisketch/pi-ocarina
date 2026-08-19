<!-- Buffer settings: how a buffer column draws and where its keys live.

     The same rows-and-keys shape as the settings screen it opens from. The
     keymap split is spec D10's: the enter-buffer keys are registry keys and
     rebindable, vim's own keys inside the buffer are vim's and are not. -->
<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import { wrapIndex } from '$lib/fuzzy'
  import { preferences } from '$lib/state/preferences.svelte'

  interface Props {
    onclose: () => void
    /** Opens the keymaps screen, where the buffer's entry keys are rebound. */
    onkeymap: () => void
  }

  const { onclose, onkeymap }: Props = $props()

  interface Row {
    label: string
    value: () => string
    enter: () => void
  }

  const rows: Row[] = [
    {
      label: 'relative line numbers',
      value: () => (preferences.bufferRelativeNumbers ? 'on' : 'off'),
      enter: () => preferences.toggleBufferRelativeNumbers(),
    },
    {
      label: 'buffer keymaps',
      value: () => 'edit',
      enter: () => onkeymap(),
    },
  ]

  let selected = $state(0)

  function onkeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        selected = wrapIndex(selected + 1, rows.length)
        break
      case 'k':
      case 'ArrowUp':
        selected = wrapIndex(selected - 1, rows.length)
        break
      case 'Enter':
        rows[selected].enter()
        break
      default:
        return
    }
    event.preventDefault()
  }
</script>

<svelte:window {onkeydown} />

<Backdrop {onclose} z={54} label="Buffer settings">
  <div class="panel">
    <div class="head">BUFFER SETTINGS</div>

    <div class="rows">
      {#each rows as row, i (row.label)}
        <button
          type="button"
          class="row"
          class:selected={i === selected}
          onclick={() => {
            selected = i
            row.enter()
          }}
          onmouseenter={() => (selected = i)}
        >
          {row.label}
          <span class="value">{row.value()}</span>
          <span class="hint">⏎</span>
        </button>
      {/each}
    </div>

    <div class="note">
      the enter keys (⏎, i) are rebindable on the keymaps screen — vim's own
      keys inside the buffer are vim's
    </div>

    <div class="foot">j/k move · ⏎ change · esc close</div>
  </div>
</Backdrop>

<style>
  .panel {
    width: 540px;
    background: var(--bg-panel);
    animation: rise 0.2s ease;
  }

  .head {
    padding: 14px 20px;
    background: var(--bg-header);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
  }

  .rows {
    padding: 8px 0;
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 20px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    color: var(--fg-agent);
    border: none;
    background: none;
    font-family: var(--font-body);
    font-size: 12px;
    transition: background 0.15s;
  }
  .row.selected {
    background: var(--accent-soft);
  }

  .value {
    margin-left: auto;
    color: var(--fg-bright);
  }

  .hint {
    color: var(--fg-dimmest);
    font-size: 10px;
    font-family: var(--font-chrome);
    width: 22px;
    text-align: right;
  }

  .note {
    padding: 4px 20px 12px;
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }

  .foot {
    display: flex;
    gap: 14px;
    padding: 10px 20px;
    background: var(--bg-header);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
</style>
