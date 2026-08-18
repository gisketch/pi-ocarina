<script lang="ts">
  import Icon from '../Icon.svelte'

  interface Props {
    text: string
    /** Absent until C3 wires cancellation. */
    oncancel?: () => void
  }

  const { text, oncancel }: Props = $props()
</script>

<div class="queued">
  <span class="tag">QUEUED</span>
  <span class="text">{text}</span>
  <span class="hint">
    sends after step
    {#if oncancel}
      · <button type="button" class="cancel" onclick={oncancel} aria-label="cancel queued message"
         ><Icon name="close" /></button
      >
    {/if}
  </span>
</div>

<style>
  .queued {
    background: rgba(255, 255, 255, 0.05);
    padding: 9px 12px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--fg-agent);
  }

  .tag {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    color: var(--warn);
    flex: none;
  }

  .hint {
    margin-left: auto;
    color: var(--fg-dimmest);
    font-size: 10px;
    font-family: var(--font-chrome);
    white-space: nowrap;
  }

  .cancel {
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: color 0.15s;
  }
  .cancel:hover {
    color: var(--err);
  }
</style>
