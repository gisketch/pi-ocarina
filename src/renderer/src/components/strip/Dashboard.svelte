<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import Composer from '../Composer.svelte'
  import type { Workspace } from '$lib/types'

  const {
    workspace,
    columnId,
    focused,
    onmodel,
    oncommit,
  }: {
    workspace: Workspace
    columnId: string
    focused: boolean
    onmodel: () => void
    oncommit: () => void
  } = $props()

  // The launcher's choices. `b` and `/` are drawn before they act — their
  // tickets land next — so a reader learns the column's shape once.
  const actions = [
    { key: 'i', label: 'new thread' },
    { key: 'b', label: 'new worktree thread' },
    { key: '/', label: 'search history' },
  ]
</script>

<div class="hero" class:focused>
  <div class="middle">
    <Identicon name={workspace.name} hue={workspace.hue} size={70} />
    <div class="name">{workspace.name}</div>
    <div class="sub">
      fresh thread — no history yet · <span class="note">♪ {workspace.note}</span>
    </div>
    <div class="actions">
      {#each actions as action (action.key)}
        <div class="action">
          <span class="kbd">{action.key}</span>
          <span class="label">{action.label}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- The column with no thread behind it is the one most likely to receive a
       first message, so it gets a field like every other. -->
  <Composer {columnId} {focused} {onmodel} {oncommit} />
</div>

<style>
  .hero {
    width: var(--column-w);
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--bg-column-idle);
    transition: background 0.4s;
    animation: rise 0.35s ease;
    overflow: hidden;
  }
  /* The same step every other column takes: the one with the reader is the
     lighter one. */
  .hero.focused {
    background: var(--bg-column-focus);
  }

  .middle {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .name {
    font-size: 20px;
    color: var(--fg-bright);
  }

  .sub {
    color: var(--fg-dim);
    font-size: 11px;
  }
  .note {
    color: var(--accent);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .action {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11.5px;
  }
  .label {
    color: var(--fg-dim);
  }
  .kbd {
    background: var(--bg-chip);
    padding: 2px 6px;
    color: var(--fg-muted);
    font-size: 10.5px;
    min-width: 10px;
    text-align: center;
  }
</style>
