<script lang="ts">
  /** An event the app could not name.
   *
   *  It is drawn deliberately plainly and deliberately visibly. Hiding it would
   *  tell the user the agent did less than it did, and a thread that quietly
   *  omits things is worse than one that admits it saw something unfamiliar. */
  interface Props {
    rawKind: string
    detail?: string
  }

  const { rawKind, detail }: Props = $props()
</script>

<div class="raw">
  <span class="tag">RAW</span>
  <span class="kind">{rawKind}</span>
  {#if detail}
    <span class="detail">{detail}</span>
  {/if}
</div>

<style>
  .raw {
    display: flex;
    align-items: baseline;
    gap: 9px;
    padding: 6px 10px;
    border: 1px dashed var(--line-mid);
    font-size: 11px;
    font-family: var(--font-body);
    color: var(--fg-dim);
  }

  .tag {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    color: var(--fg-dimmest);
    flex: none;
  }

  .kind {
    color: var(--fg-agent);
    flex: none;
  }

  .detail {
    color: var(--fg-dimmest);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
