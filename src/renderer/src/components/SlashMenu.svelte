<script lang="ts">
  import type { SlashCommand } from '$lib/slash'

  interface Props {
    commands: SlashCommand[]
    active: number
    onpick: (command: SlashCommand) => void
    onhover: (index: number) => void
  }

  const { commands, active, onpick, onhover }: Props = $props()
</script>

<div class="menu" role="listbox" aria-label="Slash commands">
  {#each commands as command, i (command.id)}
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
        onpick(command)
      }}
      onmouseenter={() => onhover(i)}
    >
      <span class="name">{command.name}</span>
      <span class="description">{command.description}</span>
      {#if i === active}<span class="kbd">⏎</span>{/if}
    </button>
  {/each}
</div>

<style>
  .menu {
    max-width: var(--column-w);
    margin: 0 auto 6px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
    animation: rise 0.15s ease;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 11px;
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

  .name {
    color: var(--accent);
    flex: none;
  }
  .row:not(.active) .name {
    color: var(--fg-dim);
  }

  .description {
    color: var(--fg-dimmer);
    font-size: 10.5px;
  }

  .kbd {
    margin-left: auto;
    font-size: 9.5px;
    color: var(--fg-dimmer);
    border: 1px solid rgba(255, 255, 255, 0.07);
    padding: 1px 6px;
  }
</style>
