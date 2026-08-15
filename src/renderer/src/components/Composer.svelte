<script lang="ts">
  import { app } from '$lib/state/app.svelte'

  interface Props {
    input?: HTMLInputElement | null
  }

  let { input = $bindable(null) }: Props = $props()

  const insert = $derived(app.mode === 'INSERT')
</script>

<div class="dock">
  <div class="composer" class:insert>
    <span class="caret">&gt;</span>
    <input
      bind:this={input}
      placeholder="Message pi in {app.workspace.name}…  (i to focus)"
      onfocus={() => (app.mode = 'INSERT')}
      onblur={() => {
        if (app.mode === 'INSERT') app.mode = 'NORMAL'
      }}
    />
    <span class="hints">
      <span><span class="kbd">⏎</span> send</span>
      <span><span class="kbd">esc</span> normal</span>
    </span>
  </div>
</div>

<style>
  .dock {
    flex: none;
    padding: 0 28px 14px;
  }

  .composer {
    max-width: var(--column-w);
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--bg-chip);
    background: var(--bg-raise-3);
    padding: 11px 14px;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }
  .composer.insert {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .caret {
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

  .hints {
    color: var(--fg-dimmest);
    font-size: 10px;
    display: flex;
    gap: 10px;
    flex: none;
  }
  .kbd {
    border: 1px solid rgba(255, 255, 255, 0.09);
    padding: 1px 5px;
  }
</style>
