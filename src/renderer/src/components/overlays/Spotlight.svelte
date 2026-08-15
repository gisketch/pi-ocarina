<script lang="ts">
  import type { Snippet } from 'svelte'
  import Backdrop from './Backdrop.svelte'

  /** The design's detached-input pattern (Components §14).
   *
   *  The input floats free above whatever it filters rather than sitting in a
   *  frame with it. That is the whole point of the pattern: the panel below can
   *  be a card grid, a list of rows, or a tile grid, and the way you type at it
   *  never changes. The switcher and the model selector are the same component
   *  with different panels. */
  interface Props {
    onclose: () => void
    z: number
    label: string
    /** Shown in the accent as a prefix, per the model selector. Absent gives
     *  the switcher's `>` prompt instead. */
    prefix?: string
    placeholder: string
    value?: string
    input?: HTMLInputElement | null
    onkeydown?: (event: KeyboardEvent) => void
    oninput?: () => void
    children: Snippet
  }

  let {
    onclose,
    z,
    label,
    prefix,
    placeholder,
    value = $bindable(''),
    input = $bindable(null),
    onkeydown,
    oninput,
    children,
  }: Props = $props()
</script>

<Backdrop {onclose} {z} {label}>
  <div class="spotlight">
    <div class="field">
      {#if prefix}
        <span class="tag">{prefix}</span>
      {:else}
        <span class="prompt">&gt;</span>
      {/if}

      <!-- svelte-ignore a11y_autofocus -->
      <input bind:this={input} bind:value {onkeydown} {oninput} {placeholder} autofocus />
      <span class="esc">esc</span>
    </div>

    {@render children()}
  </div>
</Backdrop>

<style>
  .spotlight {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .field {
    width: 440px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: var(--bg-panel);
    padding: 11px 14px;
  }

  .prompt {
    color: var(--accent);
  }

  .tag {
    font-size: 9.5px;
    color: var(--accent);
    letter-spacing: 0.1em;
    flex: none;
  }

  input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg-body);
    font-family: var(--font-body);
    font-size: 12.5px;
    caret-color: var(--accent);
    min-width: 0;
  }
  input::placeholder {
    color: var(--fg-dimmest);
  }

  .esc {
    font-size: 9.5px;
    color: var(--fg-dimmest);
    border: 1px solid rgba(255, 255, 255, 0.09);
    padding: 1px 5px;
    flex: none;
  }
</style>
