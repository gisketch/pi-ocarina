<script lang="ts">
  import GitSummary from './GitSummary.svelte'
  import { app } from '$lib/state/app.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { formatUsage } from '$lib/usage-format'

  // pi's own accounting for the focused thread. A thread that has not run a
  // turn has no usage, and the segment stays blank rather than showing zeros
  // that would read as a measurement.
  const model = $derived(threads.get(app.thread.id))
  const ctxPercent = $derived(Math.round(model.usage?.contextPercent ?? 0))
  const usage = $derived(formatUsage(model.usage))
</script>

<footer class="statusbar">
  <div class="mode" class:accented={app.accented}>{app.mode}</div>

  <div class="seg workspace">
    <span class="note">♪ {app.workspace.note}</span>{app.workspace.name}
  </div>

  <div class="seg branch">
    <GitSummary status={app.workspace.git} />
  </div>

  <div class="seg">thread {app.threadLabel}</div>

  <div class="seg right ctx">
    ctx<span class="meter"><span class="fill" style:width="{ctxPercent}%"></span></span>{ctxPercent}%
  </div>

  <div class="seg left-line">{usage}</div>

  <div class="seg left-line hints">
    <span><span class="key">h/l</span> threads</span>
    <span><span class="key">␣</span> leader</span>
    <span><span class="key">⌘K</span> commands</span>
  </div>
</footer>

<style>
  .statusbar {
    height: var(--statusbar-h);
    flex: none;
    display: flex;
    align-items: stretch;
    font-size: 10.5px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    background: var(--bg-raise-2);
    position: relative;
    z-index: 2;
    user-select: none;
    white-space: nowrap;
  }

  .mode {
    display: flex;
    align-items: center;
    padding: 0 12px;
    letter-spacing: 0.1em;
    background: var(--bg-chip);
    color: var(--fg-muted);
    transition:
      background-color 0.2s,
      color 0.2s;
  }
  .mode.accented {
    background: var(--accent);
    color: var(--bg);
  }

  .seg {
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    color: var(--fg-dim);
  }

  .workspace {
    gap: 7px;
    color: var(--fg-agent);
  }
  .note {
    color: var(--accent);
    flex: none;
  }

  .branch {
    gap: 6px;
  }

  .right {
    margin-left: auto;
  }

  .right,
  .left-line {
    border-right: none;
    border-left: 1px solid rgba(255, 255, 255, 0.04);
  }

  .ctx {
    gap: 6px;
  }
  .meter {
    width: 54px;
    height: 4px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
    display: inline-block;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: background 0.4s;
  }

  .hints {
    gap: 10px;
    color: var(--fg-dimmest);
  }
  .key {
    color: var(--fg-muted);
  }
</style>
