<script lang="ts">
  import Titlebar from './components/Titlebar.svelte'
  import Statusbar from './components/Statusbar.svelte'
  import Rail from './components/Rail.svelte'
  import Strip from './components/strip/Strip.svelte'
  import { app } from '$lib/state/app.svelte'
  import { scrollColumn } from '$lib/state/columns'

  // The accent tokens are substituted where they are declared (:root), so the
  // seeded hue must be written to the document element — setting it on .shell
  // would leave every inherited --accent stuck on the default hue.
  $effect(() => {
    document.documentElement.style.setProperty('--accent-hue', String(app.workspace.hue))
  })

  // Interim bindings: replaced wholesale by the mode state machine in T4.
  function onKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= app.workspaces.length) {
      app.goWorkspace(digit - 1)
      return
    }

    switch (event.key) {
      case 'h':
      case 'ArrowLeft':
        app.moveThread(-1)
        break
      case 'l':
      case 'ArrowRight':
        app.moveThread(1)
        break
      case 'j':
        scrollColumn(app.thread.id, 100)
        break
      case 'k':
        scrollColumn(app.thread.id, -100)
        break
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <div class="tint"></div>
  <div class="grain"></div>

  <Titlebar />

  <div class="body">
    <Rail />
    <Strip />
  </div>

  <Statusbar />
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
</style>
