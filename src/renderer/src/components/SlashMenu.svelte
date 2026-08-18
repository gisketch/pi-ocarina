<script lang="ts">
  /** The `/` menu: the app's own commands, the project's, and its skills.
   *
   *  One line per entry, always. A description that wrapped turned a list of
   *  forty into a page nobody could scan, and the source label — the thing a
   *  reader checks before running something a repository wrote — moved with
   *  every line it wrapped. */
  import Icon from './Icon.svelte'
  import MenuList from './composer/MenuList.svelte'
  import type { SlashCommand } from '$lib/slash'

  interface Props {
    commands: SlashCommand[]
    active: number
    onpick: (command: SlashCommand) => void
    onhover: (index: number) => void
  }

  const { commands, active, onpick, onhover }: Props = $props()
</script>

<!-- Keyed on the name, not the id: every project command carries the id
     `project`, so keying on it collides the moment a workspace defines two. -->
<MenuList
  label="Slash commands"
  items={commands}
  {active}
  key={(command) => command.name + command.source}
  onpick={(command) => onpick(command)}
  {onhover}
>
  {#snippet row(command: SlashCommand, isActive: boolean)}
    <span class="icon"><Icon name={command.icon ?? 'tool-raw'} /></span>
    <span class="name">{command.label ?? command.name}</span>
    <span class="description">{command.description}</span>
    <span class="meta">
      <!-- The model will not load this one on its own, so this menu is the
           only door it has. Worth a word where the reader is choosing. -->
      {#if command.explicitOnly}<span class="only">explicit</span>{/if}
      {#if command.source !== 'built-in'}<span class="from">{command.source}</span>{/if}
      {#if isActive}<span class="kbd">⏎</span>{/if}
    </span>
  {/snippet}
</MenuList>

<style>
  .icon {
    display: inline-flex;
    width: 13px;
    color: var(--fg-dimmer);
  }

  .name {
    color: var(--accent);
    white-space: nowrap;
  }
  .description {
    color: var(--fg-dimmer);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* One cell, so a row with `explicit` on it does not push the source out of
     the column the reader is running their eye down. */
  .meta {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    white-space: nowrap;
  }
  .only {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--warn);
  }
  .from {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--fg-faint);
    min-width: 42px;
    text-align: right;
  }
  .kbd {
    font-size: 9.5px;
    color: var(--fg-dimmer);
    background: var(--bg-chip);
    padding: 2px 6px;
  }
</style>
