<script lang="ts">
  import Titlebar from './components/Titlebar.svelte'
  import Statusbar from './components/Statusbar.svelte'
  import Rail from './components/Rail.svelte'
  import Strip from './components/strip/Strip.svelte'
  import Composer from './components/Composer.svelte'
  import TerminalDrawer from './components/TerminalDrawer.svelte'
  import LeaderBar from './components/LeaderBar.svelte'
  import KeymapOverlay from './components/overlays/KeymapOverlay.svelte'
  import SwitcherOverlay from './components/overlays/SwitcherOverlay.svelte'
  import CommandPalette from './components/overlays/CommandPalette.svelte'
  import SettingsOverlay from './components/overlays/SettingsOverlay.svelte'
  import ModelOverlay from './components/overlays/ModelOverlay.svelte'
  import { app } from '$lib/state/app.svelte'
  import { catalog, seedMockThreads } from '$lib/state/catalog.svelte'
  import { models } from '$lib/state/models.svelte'
  import { preferences } from '$lib/state/preferences.svelte'
  import { shell } from '$lib/state/shell.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { startPersistence } from '$lib/state/persistence.svelte'
  import type { CommandId } from '$lib/commands'

  // The demo columns are seeded first so the window is never blank. The real
  // catalog and the saved layout are loaded together by startPersistence, which
  // has to apply the layout only once the real workspace list is in place.
  seedMockThreads()
  $effect(() => startPersistence())
  // Loaded once, ahead of the first `m`, so the selector opens instantly.
  $effect(() => {
    void models.load()
  })

  // The accent tokens are substituted where they are declared (:root), so the
  // seeded hue must be written to the document element — setting it on .shell
  // would leave every inherited --accent stuck on the default hue.
  $effect(() => {
    document.documentElement.style.setProperty('--accent-hue', String(app.workspace.hue))
  })

  // Grain and motion are declared in CSS against these attributes, so the
  // settings switches and the OS reduce-motion preference say the same thing in
  // the same place.
  $effect(() => {
    document.documentElement.dataset.grain = preferences.grain ? 'on' : 'off'
    document.documentElement.dataset.motion = preferences.motion ? 'on' : 'off'
  })

  let composerInput = $state<HTMLTextAreaElement | null>(null)
  let paletteInput = $state<HTMLInputElement | null>(null)
  let switcherInput = $state<HTMLInputElement | null>(null)
  $effect(() => {
    shell.targets.composer = composerInput
  })
  $effect(() => {
    shell.targets.palette = paletteInput
  })
  $effect(() => {
    shell.targets.switcher = switcherInput
  })

  function onKeydown(event: KeyboardEvent): void {
    if (shell.handleKey(event)) event.preventDefault()
  }

  function runCommand(id: CommandId): void {
    switch (id) {
      case 'jump-workspace':
        shell.openOverlay('switcher')
        return
      case 'open-keymap':
        shell.openOverlay('keymap')
        return
      case 'next-thread':
        app.moveThread(1)
        break
      case 'new-thread':
        // Real when a folder is pinned. With the demo catalog there is nothing
        // to start a thread in, so the command shows its destination instead.
        void catalog.newThread(app.workspace.id).then((threadId) => {
          if (!threadId) app.goWorkspace(app.workspaces.length - 1)
        })
        break
      case 'switch-branch':
      case 'compact-thread':
        break
    }
    shell.closeOverlay()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <div class="tint"></div>
  <div class="grain"></div>

  <Titlebar onmodel={() => shell.openOverlay('model')} />

  <div class="body">
    <Rail onPin={() => shell.openOverlay('switcher')} onKeymap={() => shell.openOverlay('keymap')} />

    <div class="main">
      <Strip />
      {#if shell.terminal}
        <TerminalDrawer onclose={() => shell.toggleTerminal()} />
      {/if}
      <Composer bind:input={composerInput} onmodel={() => shell.openOverlay('model')} />
    </div>
  </div>

  <Statusbar />

  {#if app.mode === 'LEADER'}
    <LeaderBar />
  {/if}

  {#if shell.overlay === 'keymap'}
    <KeymapOverlay onclose={() => shell.closeOverlay()} />
  {:else if shell.overlay === 'switcher'}
    <SwitcherOverlay
      bind:input={switcherInput}
      onclose={() => shell.closeOverlay()}
      onselect={(index) => {
        app.goWorkspace(index)
        shell.closeOverlay()
      }}
    />
  {:else if shell.overlay === 'settings'}
    <SettingsOverlay
      onclose={() => shell.closeOverlay()}
      onkeymap={() => shell.openOverlay('keymap')}
      onmodel={() => shell.openOverlay('model')}
      model={threads.get(app.thread.id).model?.name ?? 'pi default'}
    />
  {:else if shell.overlay === 'model'}
    <ModelOverlay
      onclose={() => shell.closeOverlay()}
      current={threads.get(app.thread.id).model}
      onpick={(model, reasoning) => {
        threads.setModel(app.thread.id, model, reasoning)
        shell.closeOverlay()
      }}
    />
  {:else if shell.overlay === 'palette'}
    <CommandPalette
      bind:input={paletteInput}
      onclose={() => shell.closeOverlay()}
      onrun={runCommand}
    />
  {/if}
</div>

<style>
  .shell {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-chrome);
    font-size: 12px;
    position: relative;
    overflow: hidden;
  }

  .tint {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--accent-tint);
    transition: background 0.5s ease;
  }

  /* Static fractal-noise tile; no per-frame cost. */
  .grain {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 80;
    opacity: var(--grain-opacity);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
</style>
