<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import type { Workspace } from '$lib/types'

  const { workspace }: { workspace: Workspace } = $props()
</script>

<div class="hero">
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

<style>
  .hero {
    width: var(--column-w);
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    border: 1px solid var(--line);
    background: var(--bg-raise);
    animation: rise 0.35s ease;
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
    border: 1px solid var(--line-strong);
    padding: 1px 5px;
    color: var(--fg-muted);
  }
</style>
