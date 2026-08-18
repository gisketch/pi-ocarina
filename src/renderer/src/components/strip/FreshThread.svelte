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
</script>

<div class="hero">
  <div class="middle">
    <Identicon name={workspace.name} hue={workspace.hue} size={70} />
    <div class="name">{workspace.name}</div>
    <div class="sub">
      fresh thread — no history yet · <span class="note">♪ {workspace.note}</span>
    </div>
    <div class="hints">
      <span><span class="kbd">i</span> compose</span>
      <span><span class="kbd">␣</span> leader</span>
      <span><span class="kbd">⌘K</span> commands</span>
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
    animation: rise 0.35s ease;
    overflow: hidden;
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

  .hints {
    display: flex;
    gap: 14px;
    color: var(--fg-dimmest);
    font-size: 10.5px;
    margin-top: 4px;
  }
  .kbd {
    background: var(--bg-chip);
    padding: 2px 6px;
    color: var(--fg-muted);
  }
</style>
