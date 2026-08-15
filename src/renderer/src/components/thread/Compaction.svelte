<script lang="ts">
  interface Props {
    running: boolean
    beforePercent?: number
    afterPercent?: number
    summary?: string
    /** Absent until C3 wires the commands behind them. */
    onexpand?: () => void
    onundo?: () => void
  }

  const { running, beforePercent, afterPercent, summary, onexpand, onundo }: Props = $props()
</script>

{#if running}
  <div class="line">
    <span class="rule"></span>
    <span class="label">⌫ COMPACTING</span>
    <!-- Stepped, never eased: the reference's pixel shimmer moves in whole
         cells, so it reads as a machine working rather than a progress bar. -->
    <span class="shimmer"></span>
    <span class="rule"></span>
  </div>
{:else}
  <div class="card">
    <div class="head">
      <span class="label">⌫ COMPACTED</span>
      {#if beforePercent !== undefined && afterPercent !== undefined}
        <span class="ctx">ctx {beforePercent}% → <span class="after">{afterPercent}%</span></span>
      {/if}
    </div>
    {#if summary}
      <div class="summary">{summary}</div>
    {/if}
    {#if onexpand || onundo}
      <div class="actions">
        {#if onexpand}<button type="button" onclick={onexpand}>expand original ▸</button>{/if}
        {#if onundo}<button type="button" onclick={onundo}>undo</button>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    font-family: var(--font-chrome);
    color: var(--fg-dim);
  }

  .rule {
    height: 1px;
    flex: 1;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.14) 0 4px,
      transparent 4px 8px
    );
  }

  .label {
    white-space: nowrap;
  }

  .shimmer {
    width: 64px;
    height: 8px;
    flex: none;
    background: repeating-linear-gradient(
      90deg,
      oklch(0.76 0.14 var(--accent-hue) / 0.5) 0 6px,
      rgba(255, 255, 255, 0.05) 6px 12px
    );
    background-size: 120px 100%;
    animation: pixelshift 0.9s steps(10) infinite;
  }

  .card {
    border: 1px solid var(--line-faint);
    background: rgba(255, 255, 255, 0.02);
    padding: 10px 13px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 10px;
    font-family: var(--font-chrome);
    color: var(--fg-dim);
  }

  .ctx {
    margin-left: auto;
    color: var(--fg-dimmest);
  }
  .after {
    color: var(--accent);
  }

  .summary {
    color: var(--fg-dim);
    line-height: 1.65;
    font-size: 11.5px;
    font-family: var(--font-body);
  }

  .actions {
    display: flex;
    gap: 12px;
  }
  .actions button {
    background: none;
    border: none;
    padding: 0;
    font-size: 10px;
    font-family: var(--font-chrome);
    color: var(--fg-dimmest);
    cursor: pointer;
    transition: color 0.15s;
  }
  .actions button:hover {
    color: var(--fg-dim);
  }
</style>
