<script lang="ts">
  import Titlebar from './components/Titlebar.svelte'
  import Statusbar from './components/Statusbar.svelte'
  import { app } from '$lib/state/app.svelte'
</script>

<div class="shell" style:--accent-hue={app.workspace.hue}>
  <div class="tint"></div>
  <div class="grain"></div>

  <Titlebar />

  <div class="body">
    <!-- rail + thread strip land in T2/T3 -->
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
