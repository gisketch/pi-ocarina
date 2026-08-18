<script lang="ts">
  /** What the reader's own configuration file is doing, and what in it failed.
   *
   *  Read-only, and drawn apart from the rows above it for the same reason the
   *  project's inventory is: those rows change something when pressed, and
   *  these are facts about a file the app does not write.
   *
   *  Every string here comes off disk. Svelte escapes them; nothing uses
   *  `{@html}`. */
  import Icon from '../Icon.svelte'
  import { config } from '$lib/state/config.svelte'

  const rules = $derived(config.config.rules)
  const hooks = $derived(config.config.hooks)
  const nothing = $derived(rules.length === 0 && hooks.length === 0 && config.problems.length === 0)
</script>

<div class="imposed">
  <div class="banner">
    YOUR FILE
    <span class="note">{config.path === '' ? 'not read' : config.path}</span>
  </div>

  {#if nothing}
    <div class="empty">nothing configured — this file is optional</div>
  {/if}

  {#if hooks.length > 0}
    <div class="group">hooks</div>
    {#each hooks as hook, i (`${hook.on}-${i}`)}
      <div class="item">
        <span class="icon"><Icon name="tool-hook" /></span>
        <span class="name">{hook.on}</span>
        <span class="desc">{hook.command}</span>
      </div>
    {/each}
  {/if}

  {#if rules.length > 0}
    <div class="group">approval rules</div>
    {#each rules as rule, i (`${rule.effect}-${rule.tool}-${i}`)}
      <div class="item">
        <span class="effect" class:deny={rule.effect === 'deny'}>{rule.effect}</span>
        <span class="name">{rule.tool}</span>
        <span class="desc">{rule.match}</span>
        {#if rule.workspace}<span class="where">{rule.workspace}</span>{/if}
      </div>
    {/each}
  {/if}

  {#if config.problems.length > 0}
    <div class="group bad">did not load</div>
    {#each config.problems as problem, i (`${problem.where}-${i}`)}
      <div class="item">
        <span class="icon bad"><Icon name="error" /></span>
        <span class="name">{problem.where}</span>
        <span class="desc">{problem.message}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .imposed {
    margin-top: 12px;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }

  .banner {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--dim);
    padding: 0 2px 6px;
  }

  .note {
    letter-spacing: 0;
    text-transform: none;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group {
    font-size: 11px;
    color: var(--dim);
    padding: 8px 2px 4px;
  }

  .group.bad {
    color: var(--bad);
  }

  .item {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 3px 2px;
    font-size: 12px;
  }

  .icon {
    display: inline-flex;
    width: 13px;
    color: var(--dim);
  }

  .icon.bad {
    color: var(--bad);
  }

  .effect {
    min-width: 38px;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  .effect.deny {
    color: var(--bad);
  }

  .name {
    color: var(--fg);
    white-space: nowrap;
  }

  .desc {
    flex: 1;
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .where {
    font-size: 10px;
    color: var(--dim);
  }

  .empty {
    padding: 6px 2px;
    font-size: 12px;
    color: var(--dim);
  }
</style>
