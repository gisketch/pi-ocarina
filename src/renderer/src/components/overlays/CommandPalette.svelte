<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import { COMMANDS, type CommandId, filterCommands, wrapIndex } from '$lib/commands'

  interface Props {
    onclose: () => void
    onrun: (id: CommandId) => void
    input?: HTMLInputElement | null
  }

  let { onclose, onrun, input = $bindable(null) }: Props = $props()

  let query = $state('')
  let selected = $state(0)

  const results = $derived(filterCommands(COMMANDS, query))
  // Keep the highlight inside the filtered list as it shrinks.
  const active = $derived(results.length === 0 ? -1 : wrapIndex(selected, results.length))

  function run(id: CommandId): void {
    onrun(id)
  }

  function onkeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        selected = wrapIndex(active + 1, results.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        selected = wrapIndex(active - 1, results.length)
        break
      case 'Enter':
        event.preventDefault()
        if (active >= 0) run(results[active].id)
        break
    }
  }
</script>

<Backdrop {onclose} z={60} align="top" label="Command palette">
  <div class="palette">
    <div class="field">
      <span class="prompt">&gt;</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:this={input}
        bind:value={query}
        {onkeydown}
        oninput={() => (selected = 0)}
        placeholder="Type a command…"
        autofocus
      />
      <span class="esc">esc</span>
    </div>

    <div class="list">
      {#each results as command, i (command.id)}
        <button
          type="button"
          class="row"
          class:active={i === active}
          onclick={() => run(command.id)}
          onmouseenter={() => (selected = i)}
        >
          <span class="icon">{command.icon}</span>{command.label}
          <span class="kbd">{command.kbd}</span>
        </button>
      {:else}
        <div class="empty">no matching command</div>
      {/each}
    </div>
  </div>
</Backdrop>

<style>
  .palette {
    width: 560px;
    background: var(--bg-panel);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    animation: rise 0.2s ease;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 16px;
    background: var(--bg-header);
  }
  .prompt {
    color: var(--accent);
  }
  input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg-body);
    font-family: var(--font-body);
    font-size: 13px;
    caret-color: var(--accent);
  }
  input::placeholder {
    color: var(--fg-dimmest);
  }
  .esc {
    font-size: 9.5px;
    color: var(--fg-dimmest);
    background: var(--bg-chip);
    padding: 2px 6px;
  }

  .list {
    padding: 6px;
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 11px;
    cursor: pointer;
    color: var(--fg-agent);
    font-size: 11.5px;
    background: none;
    border: none;
    font-family: var(--font-chrome);
    text-align: left;
  }
  .row.active {
    background: var(--bg-hover-2);
  }

  .icon {
    color: var(--fg-dimmest);
    font-size: 10.5px;
    width: 14px;
    flex: none;
  }

  .kbd {
    margin-left: auto;
    font-size: 9.5px;
    color: var(--fg-dimmer);
    background: var(--bg-chip);
    padding: 2px 6px;
    white-space: nowrap;
  }

  .empty {
    padding: 10px 11px;
    color: var(--fg-dimmest);
    font-size: 11.5px;
  }
</style>
