<script lang="ts">
  interface Props {
    label: string
    /** Absent until C3 wires the restore command; the control stays hidden
     *  rather than offering an action that would do nothing. */
    onrestore?: () => void
  }

  const { label, onrestore }: Props = $props()
</script>

<div class="checkpoint">
  <span class="rule"></span>
  <span class="label">⟲ CHECKPOINT · {label}</span>
  {#if onrestore}
    <button type="button" class="restore" onclick={onrestore}>restore</button>
  {/if}
  <span class="rule"></span>
</div>

<style>
  .checkpoint {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    font-family: var(--font-chrome);
    color: var(--fg-dimmest);
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

  .restore {
    border: 1px solid var(--line-strong);
    background: none;
    padding: 1px 7px;
    color: var(--fg-dim);
    font-size: 10px;
    font-family: var(--font-chrome);
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .restore:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
