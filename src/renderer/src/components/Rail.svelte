<script lang="ts">
  import Identicon from './Identicon.svelte'
  import { app } from '$lib/state/app.svelte'
  import { askNotice } from '$lib/state/ask-notice.svelte'

  interface Props {
    onPin?: () => void
    onKeymap?: () => void
  }

  const { onPin, onKeymap }: Props = $props()
</script>

<nav class="rail" aria-label="Workspaces">
  {#each app.workspaces as ws, i (ws.id)}
    <button
      type="button"
      class="pin"
      class:active={i === app.workspaceIndex}
      title="{ws.name} ({i + 1})"
      aria-current={i === app.workspaceIndex}
      onclick={() => app.goWorkspace(i)}
    >
      <Identicon name={ws.name} hue={ws.hue} size={22} />
      {#if askNotice.asking(ws.id)}
        <!-- A workspace never switches by itself, so this is the only thing
             that says a thread over there is waiting on an answer. -->
        <span class="asking" aria-label="a thread is asking">?</span>
      {/if}
    </button>
  {/each}

  <button type="button" class="slot add" title="pin a workspace (w)" onclick={onPin}>+</button>

  <button type="button" class="slot help" title="keymap (?)" onclick={onKeymap}>?</button>
</nav>

<style>
  .pin {
    position: relative;
  }
  .asking {
    position: absolute;
    top: -2px;
    right: -2px;
    font-family: var(--font-chrome);
    font-size: 10px;
    line-height: 1;
    color: var(--warn, var(--accent));
  }

  .rail {
    width: var(--rail-w);
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 16px 0 12px;
    border-right: 1px solid var(--bg-hover);
  }

  .pin {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    opacity: 0.35;
    transition: opacity 0.2s;
  }
  .pin:hover,
  .pin.active {
    opacity: 1;
  }

  .slot {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    color: var(--fg-dimmest);
    cursor: pointer;
    transition:
      color 0.2s,
      border-color 0.2s;
  }

  .add {
    border: 1px dashed var(--line-strong);
    font-size: 12px;
    font-family: var(--font-chrome);
  }
  .add:hover {
    color: var(--fg-muted);
    border-color: rgba(255, 255, 255, 0.35);
  }

  .help {
    margin-top: auto;
    border: none;
    font-size: 10px;
    font-family: var(--font-chrome);
  }
  .help:hover {
    color: var(--fg-muted);
  }
</style>
