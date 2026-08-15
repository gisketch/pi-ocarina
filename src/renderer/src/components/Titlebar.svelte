<script lang="ts">
  import { app } from '$lib/state/app.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { windowControls } from '$lib/bridge'

  // One dot per workspace slot plus a trailing empty slot, per the design's
  // "ocarina dots — active workspace indicator".
  const dotCount = $derived(app.workspaces.length + 1)

  const { onmodel }: { onmodel?: () => void } = $props()

  // Whatever pi says this thread is on. "pi default" until it says.
  const model = $derived(threads.get(app.thread.id).model?.name ?? 'pi default')
</script>

<header class="titlebar">
  <div class="controls">
    <button type="button" class="square" aria-label="Close window" onclick={windowControls.close}
    ></button>
    <button
      type="button"
      class="square"
      aria-label="Minimize window"
      onclick={windowControls.minimize}
    ></button>
    <button
      type="button"
      class="square"
      aria-label="Maximize window"
      onclick={windowControls.toggleMaximize}
    ></button>
  </div>

  <div class="brand">
    <span class="wordmark">PI<span class="wordmark-dim">OCARINA</span></span>
    <span class="dots">
      {#each { length: dotCount } as _, i (i)}
        <span class="dot" class:active={i === app.workspaceIndex}></span>
      {/each}
    </span>
  </div>

  <div class="status">
    <span class="note">♪ {app.workspace.note}</span>
    <span class="name">{app.workspace.name}</span>
    <span class="sep">·</span>
    <span class="name">thread {app.threadLabel}</span>
    <span class="sep">·</span>
    <button type="button" class="model" onclick={onmodel} disabled={!onmodel}>
      {model} · m
    </button>
  </div>
</header>

<style>
  .titlebar {
    height: var(--titlebar-h);
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 14px;
    border-bottom: 1px solid var(--line-faint);
    position: relative;
    z-index: 2;
    -webkit-app-region: drag;
  }

  .controls {
    display: flex;
    gap: 7px;
    flex: none;
    -webkit-app-region: no-drag;
  }

  .square {
    width: 10px;
    height: 10px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: var(--fg-ghost);
    cursor: pointer;
    transition: background 0.15s;
  }
  .square:hover {
    background: var(--fg-dimmest);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }

  .wordmark {
    font-size: 14px;
    color: var(--fg-bright);
  }
  .wordmark-dim {
    color: var(--fg-dimmer);
  }

  .dots {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
  .dot {
    width: 4px;
    height: 4px;
    background: var(--fg-faint);
    transition: background 0.4s;
  }
  .dot.active {
    background: var(--accent);
  }

  .status {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--fg-dimmer);
    white-space: nowrap;
  }
  .note {
    color: var(--accent);
    flex: none;
  }
  .name {
    color: var(--fg-dim);
  }
  .sep {
    color: var(--fg-faint);
  }
  .model {
    border: 1px solid var(--line-mid);
    padding: 3px 8px;
    background: var(--bg-hover);
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .model:disabled {
    cursor: default;
  }
  .model:not(:disabled):hover {
    color: var(--fg-dim);
    border-color: var(--line-strong);
  }
</style>
