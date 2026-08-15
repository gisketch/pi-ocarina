<script lang="ts">
  import Titlebar from './components/Titlebar.svelte'
  import Statusbar from './components/Statusbar.svelte'
  import Rail from './components/Rail.svelte'
  import Strip from './components/strip/Strip.svelte'
  import Welcome from './components/Welcome.svelte'
  import Composer from './components/Composer.svelte'
  import TerminalDrawer from './components/TerminalDrawer.svelte'
  import LeaderBar from './components/LeaderBar.svelte'
  import KeymapOverlay from './components/overlays/KeymapOverlay.svelte'
  import SwitcherOverlay from './components/overlays/SwitcherOverlay.svelte'
  import CommandPalette from './components/overlays/CommandPalette.svelte'
  import SettingsOverlay from './components/overlays/SettingsOverlay.svelte'
  import ModelOverlay from './components/overlays/ModelOverlay.svelte'
  import SearchOverlay from './components/overlays/SearchOverlay.svelte'
  import { app } from '$lib/state/app.svelte'
  import { bridge } from '$lib/bridge'
  import { catalog, seedMockThreads } from '$lib/state/catalog.svelte'
  import { attachments } from '$lib/state/attachments.svelte'
  import { models } from '$lib/state/models.svelte'
  import { preferences } from '$lib/state/preferences.svelte'
  import { shell } from '$lib/state/shell.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { startPersistence } from '$lib/state/persistence.svelte'
  import type { CommandId } from '$lib/commands'
  import { REASONING_ORDER } from '../../shared/vocabulary'

  // The demo columns belong to the browser harness alone — it has no backend
  // to pin against, so demo data is the only thing it can draw. The desktop app
  // opens on the welcome screen instead, because a person cannot tell a demo
  // thread from a real one. The real catalog and the saved layout are loaded
  // together by startPersistence, which has to apply the layout only once the
  // real workspace list is in place.
  if (!bridge) seedMockThreads()
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

  // Dragenter/dragleave fire for every child element, so the zone is driven by
  // a depth counter rather than by the last event seen.
  let dragDepth = $state(0)

  function ondragenter(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    dragDepth += 1
    attachments.dragging = true
  }

  function ondragleave(): void {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) attachments.dragging = false
  }

  function ondragover(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
  }

  function ondrop(event: DragEvent): void {
    event.preventDefault()
    dragDepth = 0
    attachments.dragging = false
    attachments.add([...(event.dataTransfer?.files ?? [])])
  }

  function onKeydown(event: KeyboardEvent): void {
    if (shell.handleKey(event)) event.preventDefault()
  }

  /** Puts a thread from somewhere else on screen: the right workspace, then the
   *  right column within it. */
  function jumpTo(workspaceId: string, threadId: string): void {
    const workspace = app.workspaces.findIndex((candidate) => candidate.id === workspaceId)
    if (workspace === -1) return
    app.goWorkspace(workspace)

    const column = app.workspaces[workspace].threads.findIndex((thread) => thread.id === threadId)
    if (column !== -1) app.focusThread(column)
  }

  /** Moves the focused thread's reasoning one level. pi clamps it to what the
   *  model supports and reports back what it landed on. */
  function stepReasoning(direction: 1 | -1): void {
    const current = threads.get(app.thread.id).model?.reasoning
    if (!current) return

    const at = REASONING_ORDER.indexOf(current)
    const next = REASONING_ORDER[Math.min(REASONING_ORDER.length - 1, Math.max(0, at + direction))]
    if (next !== current) threads.setReasoning(app.thread.id, next)
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
<svelte:body {ondragenter} {ondragleave} {ondragover} {ondrop} />

<div class="shell">
  <div class="tint"></div>
  <div class="grain"></div>

  <Titlebar onmodel={() => shell.openOverlay('model')} />

  <div class="body">
    <Rail onPin={() => shell.openOverlay('switcher')} onKeymap={() => shell.openOverlay('keymap')} />

    <div class="main">
      {#if catalog.source === 'empty'}
        <Welcome />
      {:else}
        <Strip />
        {#if shell.terminal}
          <TerminalDrawer onclose={() => shell.toggleTerminal()} />
        {/if}
        <Composer bind:input={composerInput} onmodel={() => shell.openOverlay('model')} />
      {/if}
    </div>
  </div>

  {#if attachments.dragging}
    <div class="dropzone">▤ drop files to attach — images go to the model, others are named for it</div>
  {/if}

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
      reasoning={threads.get(app.thread.id).model?.reasoning}
      onreasoning={threads.get(app.thread.id).model
        ? (direction) => stepReasoning(direction)
        : undefined}
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
  {:else if shell.overlay === 'search'}
    <SearchOverlay
      onclose={() => shell.closeOverlay()}
      onjump={(hit) => {
        jumpTo(hit.workspaceId, hit.threadId)
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

  /* Shown while a file is over the window. Pointer-events off so it cannot
     swallow the drop it is advertising. */
  .dropzone {
    position: absolute;
    inset: var(--titlebar-h) 0 0 0;
    z-index: 70;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed oklch(0.76 0.14 var(--accent-hue) / 0.5);
    background: oklch(0.76 0.14 var(--accent-hue) / 0.05);
    color: var(--accent);
    font-size: 10.5px;
    font-family: var(--font-chrome);
  }
</style>
