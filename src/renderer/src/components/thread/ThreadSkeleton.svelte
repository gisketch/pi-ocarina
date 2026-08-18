<script lang="ts">
  /** Stands in while a thread's history is read back from disk.
   *
   *  Every animation here is `steps()`. Nothing eases, nothing fades: the
   *  design's loading state marches in whole pixels, so a slow replay reads as
   *  a machine working rather than as a smooth progress bar pretending to know
   *  how long it will take. */
</script>

<div class="skeleton" aria-label="loading thread history" aria-busy="true">
  <span class="bar label"></span>
  <span class="bar" style:width="100%"></span>
  <span class="bar" style:width="72%" style:animation-delay="0.15s"></span>
  <span class="bar" style:width="45%" style:animation-delay="0.3s"></span>

  <div class="ledger">
    {#each [0, 1, 2] as row (row)}
      <div class="row">
        <span class="node" style:animation-delay="{row * 0.2}s"></span>
        <span class="bar kind" style:animation-delay="{row * 0.1}s"></span>
        <span class="bar target" style:animation-delay="{row * 0.1 + 0.2}s"></span>
        <span class="bar meta" style:animation-delay="{row * 0.1 + 0.4}s"></span>
      </div>
    {/each}
  </div>
</div>

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bar {
    height: 10px;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.12) 0 6px,
      rgba(255, 255, 255, 0.04) 6px 12px
    );
    background-size: 120px 100%;
    animation: pixelshift 1.1s steps(10) infinite;
  }

  .label {
    width: 34px;
    height: 8px;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.16) 0 6px,
      rgba(255, 255, 255, 0.04) 6px 12px
    );
    background-size: 120px 100%;
  }

  /* The spine the real ledger draws, waiting. Drawn as a band rather than an
     edge, for the same reason the ledger's own is a pseudo-element. */
  .ledger {
    margin-top: 6px;
    background: linear-gradient(to right, var(--spine) 0 1px, transparent 1px);
    margin-left: 3px;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 6px;
  }

  .node {
    position: absolute;
    left: -20px;
    width: 7px;
    height: 7px;
    background: var(--fg-dim);
    animation: blinkpx 1s steps(2) infinite;
  }

  .kind {
    width: 36px;
    height: 8px;
    flex: none;
  }
  .target {
    width: 150px;
    height: 8px;
    flex: none;
  }
  .meta {
    margin-left: auto;
    width: 44px;
    height: 8px;
    flex: none;
  }
</style>
